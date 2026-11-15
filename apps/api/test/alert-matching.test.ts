import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, json, makeTestApp, resetAccounts } from './helpers'
import { donor, near, prefs, smsCall, toPhones } from './alert-helpers'
import { call, fq } from './request-helpers'
import { callAlerts } from '@damu/db'
import { BRAND } from '@damu/shared-types'
import { newId } from '../src/lib/id'
import { fixedClock } from '../src/lib/clock'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

const preview = async (a: any, body: Record<string, unknown> = {}) =>
	json(await call(t, 'POST', fq(a.id, `/${a.r.id}/alert-preview`), a.attendant.body.accessToken, { types: ['A+', 'A-', 'O+', 'O-'], urgency: 'normal', ...body }))

describe('who is alerted (each rule on its own)', () => {
	const broken: [string, Parameters<typeof donor>[2]][] = [
		['under 18', { signup: { dateOfBirth: '2015-01-01' } }],
		['over 65', { signup: { dateOfBirth: '1950-01-01' } }],
		['no recorded blood type', { facts: { blood_type: null } }],
		['a blood type the call does not accept', { facts: { blood_type: 'B+' } }],
		['inside the waiting period', { facts: { last_donation_on: '2026-10-20' } }],
		['phone not verified', { phone: false }],
		['SMS opt-in off', { facts: { sms_opt_in: 0 } }],
		['suspended account', { facts: { status: 'suspended' } }],
	]
	it('alerts the baseline donor', async () => {
		const { a, publishWith } = await smsCall(t)
		const d = await donor(t, a.id)
		expect((await publishWith()).status).toBe(201)
		expect(toPhones(t)).toEqual([d.e164])
	})
	it('still alerts a donor recorded under 50 kg (the facility decides on the day)', async () => {
		const { a, publishWith } = await smsCall(t)
		const d = await donor(t, a.id, { facts: { weight_kg: 40 } })
		await publishWith()
		expect(toPhones(t)).toEqual([d.e164])
	})
	it.each(broken)('skips a donor with %s', async (_n, over) => {
		const { a, publishWith } = await smsCall(t)
		await donor(t, a.id, over)
		expect((await publishWith()).status).toBe(201)
		expect(toPhones(t)).toEqual([])
	})
	it('skips paused, unavailable and SMS-off preferences', async () => {
		const { a, publishWith } = await smsCall(t)
		await prefs(t, (await donor(t, a.id)).id, { pausedUntil: new Date('2026-11-20T00:00:00Z') })
		await prefs(t, (await donor(t, a.id)).id, { available: false })
		await prefs(t, (await donor(t, a.id)).id, { smsAlerts: false })
		await publishWith()
		expect(toPhones(t)).toEqual([])
	})
	it('a pause that has ended no longer counts', async () => {
		const { a, publishWith } = await smsCall(t)
		const d = await donor(t, a.id)
		await prefs(t, d.id, { pausedUntil: new Date('2026-11-10T00:00:00Z') })
		await publishWith()
		expect(toPhones(t)).toEqual([d.e164])
	})
})

describe('rings', () => {
	it('puts donors in the nearest ring any of their facilities gives', async () => {
		const { a, publishWith } = await smsCall(t)
		const f2 = await near(t, 0.045, 'Siaya') // about 5 km, another county
		const f3 = await near(t, 0.2, 'Siaya') // about 22 km
		const f3c = await near(t, 0.5, 'Kisumu') // about 55 km but the same county
		const out = await near(t, 0.3, 'Siaya') // about 33 km, another county
		await donor(t, a.id)
		await donor(t, f2.id)
		await donor(t, f3.id)
		await donor(t, f3c.id)
		await donor(t, out.id)
		await donor(t, out.id, { extra: [a.id] }) // the call's own facility as an extra one: ring 1
		const p = await preview(a)
		expect(p.rings.map((r: any) => r.count)).toEqual([2, 1, 2])
		expect(p.total).toBe(5)
		await publishWith()
		expect(toPhones(t)).toHaveLength(2) // ring 1 only
	})
	it('narrowing the types lowers the counts', async () => {
		const { a } = await smsCall(t)
		await donor(t, a.id)
		await donor(t, a.id, { facts: { blood_type: 'O-' } })
		expect((await preview(a)).total).toBe(2)
		expect((await preview(a, { types: ['A+'] })).total).toBe(1)
	})
})

describe('limits', () => {
	it('the weekly cap holds back a normal call, not an urgent one', async () => {
		const { a, publishWith } = await smsCall(t)
		const d = await donor(t, a.id)
		for (let i = 0; i < 3; i++) await t.db.insert(callAlerts).values({ id: newId(), callId: `old${i}`.padEnd(26, 'x'), userId: d.id, ring: 1, status: 'sent', createdAt: new Date('2026-11-12T08:00:00Z'), sentAt: new Date('2026-11-12T08:00:00Z') })
		await publishWith()
		expect(toPhones(t)).toEqual([])
		const b = await smsCall(t, { urgency: 'urgent' })
		await donor(t, b.a.id) // a fresh donor is not the point: the capped one must be reachable by an urgent call
		await t.pool.query('update users set home_facility_id = ? where id = ?', [b.a.id, d.id])
		await b.publishWith()
		expect(toPhones(t)).toContain(d.e164)
	})
	it('the donor own stricter cap applies', async () => {
		const { a, publishWith } = await smsCall(t)
		const d = await donor(t, a.id)
		await prefs(t, d.id, { weeklyCap: 1 })
		await t.db.insert(callAlerts).values({ id: newId(), callId: 'old'.padEnd(26, 'x'), userId: d.id, ring: 1, status: 'sent', createdAt: new Date('2026-11-13T08:00:00Z'), sentAt: new Date('2026-11-13T08:00:00Z') })
		await publishWith()
		expect(toPhones(t)).toEqual([])
	})
	it('quiet hours hold a normal call until morning, and never an urgent one', async () => {
		clock.set('2026-11-14T19:30:00Z') // 22:30 in Nairobi
		const { a, publishWith } = await smsCall(t)
		const d = await donor(t, a.id)
		await publishWith()
		expect(toPhones(t)).toEqual([])
		const u = await smsCall(t, { urgency: 'urgent' })
		const d2 = await donor(t, u.a.id)
		await u.publishWith()
		expect(toPhones(t)).toEqual([d2.e164])
		void d
	})
	it('the preview needs a team member and changes nothing', async () => {
		const { a } = await smsCall(t)
		await donor(t, a.id)
		expect((await call(t, 'POST', fq(a.id, `/${a.r.id}/alert-preview`), a.who.body.accessToken, { types: ['A+'], urgency: 'normal' })).status).toBe(404)
		const p = await preview(a)
		expect(p.text).toMatch(new RegExp(`^${BRAND.name}: A\\+ blood needed at .+, Kisumu\\. Reply YES if you can come, or open .+\\. Reply STOP to stop alerts\\.$`))
		expect(p.length).toBe(p.text.length)
		expect(toPhones(t)).toEqual([])
		void auth
	})
})
