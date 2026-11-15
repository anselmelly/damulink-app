import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { json, makeTestApp, resetAccounts } from './helpers'
import { donor, inbound, smsCall } from './alert-helpers'
import { call } from './request-helpers'
import { cq, detail } from './call-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

async function twoYes() {
	const s = await smsCall(t, {}, { patientName: 'Wanjiku Kamau', patientRef: 'Ward 4, bed 12' })
	const da = await donor(t, s.a.id)
	const db = await donor(t, s.a.id)
	const c = await json(await s.publishWith())
	await inbound(t, da.e164, 'YES')
	await inbound(t, db.e164, 'YES')
	t.sms.sent.length = 0
	const d = await detail(t, s.a.adminToken, s.a.id, c.id)
	return { ...s, da, db, c, d }
}

describe('texts after the first alert', () => {
	it('scheduling a donor sends them the day and time in Nairobi time', async () => {
		const w = await twoYes()
		const row = w.d.responses[0]
		const res = await call(t, 'POST', cq(w.a.id, `/${w.c.id}/responses/${row.id}/schedule`), w.a.adminToken, { scheduledAt: '2026-11-15T06:30:00Z' })
		expect(res.status).toBe(200)
		expect(t.sms.sent).toHaveLength(1)
		expect(t.sms.sent[0].text).toMatch(/15 November.*09:30/)
		expect(t.sms.sent[0].text).not.toMatch(/Wanjiku|Ward 4/)
	})
	it('closing thanks donors who said yes and were not scheduled, once', async () => {
		const w = await twoYes()
		const [first, second] = w.d.responses
		await call(t, 'POST', cq(w.a.id, `/${w.c.id}/responses/${first.id}/schedule`), w.a.adminToken, { scheduledAt: '2026-11-15T06:30:00Z' })
		t.sms.sent.length = 0
		await call(t, 'POST', cq(w.a.id, `/${w.c.id}/close`), w.a.adminToken, { reason: 'covered' })
		expect(t.sms.sent).toHaveLength(1)
		expect(t.sms.sent[0].text).toMatch(/thank/i)
		expect(t.sms.sent[0].text).not.toMatch(/Wanjiku|Ward 4/)
		await call(t, 'POST', cq(w.a.id, `/${w.c.id}/close`), w.a.adminToken, { reason: 'covered' })
		expect(t.sms.sent).toHaveLength(1)
		void second
	})
	it('opted-out donors get nothing', async () => {
		const w = await twoYes()
		await inbound(t, w.da.e164, 'STOP')
		await inbound(t, w.db.e164, 'STOP')
		t.sms.sent.length = 0
		await call(t, 'POST', cq(w.a.id, `/${w.c.id}/close`), w.a.adminToken, { reason: 'covered' })
		expect(t.sms.sent).toHaveLength(0)
	})
})
