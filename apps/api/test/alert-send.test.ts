import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { callResponses } from '@damu/db'
import { fixedClock } from '../src/lib/clock'
import { newId } from '../src/lib/id'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { alerts, donor, hoursLater, near, smsCall, tick, toPhones } from './alert-helpers'
import { cq, detail } from './call-helpers'
import { call } from './request-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

/** A call at the base facility with one donor per ring. */
async function world(publishOver: Record<string, unknown> = {}, reqOver: Record<string, unknown> = {}) {
	const s = await smsCall(t, publishOver, reqOver)
	const f2 = await near(t, 0.045, 'Siaya')
	const f3 = await near(t, 0.2, 'Siaya')
	const d1 = await donor(t, s.a.id)
	const d2 = await donor(t, f2.id)
	const d3 = await donor(t, f3.id)
	return { ...s, d1, d2, d3 }
}

describe('publishing with SMS on', () => {
	it('is accepted now, and sends ring 1 only, one text each, with no patient data', async () => {
		const w = await world({}, { patientName: 'Wanjiku Kamau', patientRef: 'Ward 4, bed 12' })
		const res = await w.publishWith()
		expect(res.status).toBe(201)
		expect(toPhones(t)).toEqual([w.d1.e164])
		const text = alerts(t)[0].text
		expect(text).toContain('A+ blood needed at')
		expect(text).toMatch(/\/c\/[a-z0-9]+/)
		for (const secret of ['Wanjiku', 'Kamau', 'Ward 4', 'bed 12', 'REQ-']) expect(text).not.toContain(secret)
		expect(text.length).toBeLessThanOrEqual(240)
	})
	it('a second pass texts nobody twice', async () => {
		const w = await world()
		await w.publishWith()
		await tick(t)
		await tick(t)
		expect(toPhones(t)).toEqual([w.d1.e164])
	})
	it('a number the provider refuses is failed, the rest still get theirs', async () => {
		const s = await smsCall(t)
		const a = await donor(t, s.a.id)
		const b = await donor(t, s.a.id)
		const sent: any[] = t.sms.sent
		t.sms.send = async (m) => {
			if (m.to === a.e164) throw new Error('refused')
			sent.push(m)
		}
		expect((await s.publishWith()).status).toBe(201)
		expect(toPhones(t)).toEqual([b.e164])
		const row = (await t.pool.query('select status from call_alerts where user_id = ?', [a.id]) as any)[0][0]
		expect(row.status).toBe('failed')
	})
})

describe('widening', () => {
	it('normal: ring 2 after 12 hours, ring 3 after 24', async () => {
		clock.set('2026-11-14T04:30:00Z') // 07:30 in Nairobi, so 12 and 24 hours later are outside quiet hours
		const w = await world()
		await w.publishWith()
		hoursLater(t, 11)
		await tick(t)
		expect(toPhones(t)).toEqual([w.d1.e164])
		hoursLater(t, 1)
		await tick(t)
		expect(toPhones(t)).toEqual([w.d1.e164, w.d2.e164])
		hoursLater(t, 12)
		await tick(t)
		expect(toPhones(t)).toEqual([w.d1.e164, w.d2.e164, w.d3.e164])
	})
	it('urgent: every 2 hours', async () => {
		const w = await world({ urgency: 'urgent' })
		await w.publishWith()
		hoursLater(t, 2)
		await tick(t)
		expect(toPhones(t)).toHaveLength(2)
		hoursLater(t, 2)
		await tick(t)
		expect(toPhones(t)).toHaveLength(3)
	})
	it('surge: all rings at once', async () => {
		const w = await world({ urgency: 'surge' })
		await w.publishWith()
		expect(toPhones(t).sort()).toEqual([w.d1.e164, w.d2.e164, w.d3.e164].sort())
	})
	it('stops when the units are covered', async () => {
		const w = await world({}, { units: 1 })
		const res = await json(await w.publishWith())
		await t.db.insert(callResponses).values({ id: newId(), callId: res.id, userId: w.d1.id, ring: 1, status: 'donated', repliedAt: clock.now() })
		hoursLater(t, 13)
		await tick(t)
		expect(toPhones(t)).toEqual([w.d1.e164])
	})
	it('stops when the call is closed', async () => {
		const w = await world()
		const res = await json(await w.publishWith())
		await call(t, 'POST', cq(w.a.id, `/${res.id}/close`), w.a.adminToken, { reason: 'covered' })
		t.sms.sent.length = 0
		hoursLater(t, 13)
		await tick(t)
		expect(alerts(t)).toEqual([])
	})
	it('picks up a donor who was held back by quiet hours once it is morning', async () => {
		clock.set('2026-11-14T19:30:00Z') // 22:30 Nairobi
		const w = await world()
		await w.publishWith()
		expect(toPhones(t)).toEqual([])
		clock.set('2026-11-15T04:30:00Z') // 07:30 Nairobi
		await tick(t)
		expect(toPhones(t)).toEqual([w.d1.e164])
	})
})

describe('the cron tick', () => {
	it('needs its key', async () => {
		expect((await tick(t, 'wrong')).status).toBe(401)
		expect((await t.app.request('/api/cron/tick', { method: 'POST' })).status).toBe(401)
		expect((await tick(t)).status).toBe(200)
	})
	it('also expires calls that ran out of time', async () => {
		const w = await world()
		const res = await json(await w.publishWith())
		hoursLater(t, 24 * 3)
		await tick(t)
		const tok = (await json(await t.app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: w.a.owner.input.email, password: 'correct-horse' }) }))).accessToken
		expect((await detail(t, tok, w.a.id, res.id)).status).toBe('expired')
		void auth
		void get
	})
})
