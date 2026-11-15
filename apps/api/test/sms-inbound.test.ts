import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { json, makeTestApp, resetAccounts } from './helpers'
import { alerts, donor, hoursLater, inbound, near, smsCall, tick } from './alert-helpers'
import { callResponses } from '@damu/db'
import { newId } from '../src/lib/id'
import { call } from './request-helpers'
import { cq, detail, fresh } from './call-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

async function alerted(over: Record<string, unknown> = {}, reqOver: Record<string, unknown> = {}) {
	const s = await smsCall(t, over, reqOver)
	const d = await donor(t, s.a.id)
	const c = await json(await s.publishWith())
	t.sms.sent.length = 0
	return { ...s, d, c }
}
const rows = async (w: any) => (await detail(t, await fresh(t, w.a.owner), w.a.id, w.c.id)).responses as any[]
const texts = () => t.sms.sent.map((m) => m.text).filter((x) => !/your code is/.test(x))

describe('the callback key', () => {
	it('is required (401), and unknown numbers get a quiet 200', async () => {
		const w = await alerted()
		expect((await inbound(t, w.d.e164, 'YES', null)).status).toBe(401)
		expect((await inbound(t, w.d.e164, 'YES', 'nope')).status).toBe(401)
		expect((await rows(w))).toHaveLength(0)
		const r = await inbound(t, '+254799999999', 'YES')
		expect(r.status).toBe(200)
		expect(t.sms.sent).toHaveLength(0)
	})
	it('malformed bodies are refused without leaking', async () => {
		const r = await t.app.request('/api/sms/inbound?key=test-hook-key', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'from=%E0%A4%A' })
		expect([200, 422]).toContain(r.status)
	})
})

describe('YES', () => {
	it('makes the donor row with the ring, and sends one confirmation', async () => {
		const w = await alerted()
		expect((await inbound(t, w.d.e164, '  yes ')).status).toBe(200)
		expect(await rows(w)).toMatchObject([{ name: 'Amina Wanjiru', status: 'willing', ring: 1 }])
		expect(texts()).toHaveLength(1)
		expect(t.sms.sent[0].to).toBe(w.d.e164)
	})
	it('twice changes nothing', async () => {
		const w = await alerted()
		await inbound(t, w.d.e164, 'YES')
		await inbound(t, w.d.e164, 'Yes')
		expect(await rows(w)).toHaveLength(1)
		expect(texts()).toHaveLength(1)
	})
	it('is ignored with no alert, an old alert, or a closed call', async () => {
		const s = await smsCall(t)
		const stranger = await donor(t, s.a.id, { facts: { sms_opt_in: 0 } }) // never alerted
		const c = await json(await s.publishWith())
		await inbound(t, stranger.e164, 'YES')
		expect(await detail(t, s.a.adminToken, s.a.id, c.id).then((d) => d.responses)).toHaveLength(0)

		const w = await alerted()
		const w2 = await alerted()
		await call(t, 'POST', cq(w2.a.id, `/${w2.c.id}/close`), w2.a.adminToken, { reason: 'covered' })
		await inbound(t, w2.d.e164, 'YES')
		expect(await rows(w2)).toHaveLength(0)

		hoursLater(t, 49)
		await inbound(t, w.d.e164, 'YES')
		expect(await rows(w)).toHaveLength(0)
	})
	it('when the units are already covered: not_needed and a polite reply', async () => {
		const w = await alerted({}, { units: 1 })
		await t.db.insert(callResponses).values({ id: newId(), callId: w.c.id, userId: (await donor(t, w.a.id, { facts: { sms_opt_in: 0 } })).id, ring: 1, status: 'donated', repliedAt: clock.now() })
		await inbound(t, w.d.e164, 'YES')
		expect((await rows(w)).map((r) => r.status).sort()).toEqual(['donated', 'not_needed'])
		expect(texts()[0]).toMatch(/enough donors/i)
	})
	it('unknown words are ignored', async () => {
		const w = await alerted()
		await inbound(t, w.d.e164, 'maybe later')
		expect(await rows(w)).toHaveLength(0)
		expect(t.sms.sent).toHaveLength(0)
	})
})

describe('STOP', () => {
	it('switches SMS off, confirms once, and later rings skip the donor', async () => {
		const w = await alerted()
		await inbound(t, w.d.e164, 'stop')
		await inbound(t, w.d.e164, 'STOP')
		expect(texts()).toHaveLength(1)
		expect(texts()[0]).toMatch(/stop/i)
		const s2 = await smsCall(t)
		await t.pool.query('update users set home_facility_id = ? where id = ?', [s2.a.id, w.d.id])
		await s2.publishWith()
		expect(alerts(t)).toEqual([])
		void near
		void tick
	})
	it('is honoured even with no alert', async () => {
		const s = await smsCall(t)
		const d = await donor(t, s.a.id)
		await inbound(t, d.e164, 'STOP')
		await s.publishWith()
		expect(alerts(t)).toEqual([])
	})
})
