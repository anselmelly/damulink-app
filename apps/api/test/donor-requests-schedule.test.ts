import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, makeTestApp, post, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { appt, checkinDesk, donor, dr, verifiedDonor } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const smsText = () => t.sms.sent.filter((m) => !/your code is/i.test(m.text))
const schedule = (d: Awaited<ReturnType<typeof checkinDesk>>, id: string, scheduledAt: string, token = d.token) => call(t, 'POST', dr(d.id, `/${id}/schedule`), token, { scheduledAt })

describe('setting a date', () => {
	it('books the visit and texts the date and the donor code (Nairobi time)', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id)
		t.sms.sent.length = 0
		const res = await schedule(d, id, '2026-11-17T07:00:00Z')
		expect(res.status).toBe(200)
		const [a] = await rows(`select status, scheduled_at from donation_requests where id = ?`, [id])
		expect(a.status).toBe('scheduled')
		expect(new Date(a.scheduled_at).toISOString()).toBe('2026-11-17T07:00:00.000Z')
		expect(smsText()).toHaveLength(1)
		expect(smsText()[0].text).toContain('10:00')
		expect(smsText()[0].text).toContain(p.code)
	})

	it('rescheduling moves the date, texts again and clears the donor\'s reschedule mark', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-16 07:00:00', reschedule_asked: 1 })
		t.sms.sent.length = 0
		expect((await schedule(d, id, '2026-11-19T11:30:00Z')).status).toBe(200)
		const [a] = await rows(`select reschedule_asked, scheduled_at from donation_requests where id = ?`, [id])
		expect(a.reschedule_asked).toBe(0)
		expect(smsText()).toHaveLength(1)
		expect(smsText()[0].text).toMatch(/moved|new/i)
	})

	it('the donor sees the new date on their appointments', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id)
		await schedule(d, id, '2026-11-17T07:00:00Z')
		const mine = await json(await get(t, '/api/me/donation-requests', auth(p.body.accessToken)))
		expect(mine[0]).toMatchObject({ id, status: 'scheduled', scheduledAt: '2026-11-17T07:00:00.000Z' })
	})

	it('a date in the past, over 60 days ahead or not a date is 422', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id)
		expect((await schedule(d, id, '2026-11-10T07:00:00Z')).status).toBe(422)
		expect((await schedule(d, id, '2027-03-01T07:00:00Z')).status).toBe(422)
		expect((await schedule(d, id, 'tomorrow')).status).toBe(422)
	})

	it('a donation inside the waiting period is refused with the first eligible date; a test is allowed', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { last_donation_on: '2026-10-20' })
		const id = await appt(t, p.id, d.id)
		const res = await schedule(d, id, '2026-11-17T07:00:00Z')
		expect(res.status).toBe(422)
		expect((await json(res)).error.fields.eligibleOn).toBe('2027-02-20')
		const q = await verifiedDonor(t, { last_donation_on: '2026-10-20' }, { name: 'Mercy Wangari' })
		const tid = await appt(t, q.id, d.id, { kind: 'test' })
		expect((await schedule(d, tid, '2026-11-17T07:00:00Z')).status).toBe(200)
		// a date after the waiting period is fine, within 60 days
		expect((await schedule(d, id, '2027-01-12T07:00:00Z')).status).toBe(422) // 59 days out but still inside the period (until 20 Feb)
	})

	it('only a requested or booked visit can be set; another facility\'s is 404', async () => {
		const d = await checkinDesk(t)
		const o = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const done = await appt(t, p.id, d.id, { status: 'completed' })
		expect((await schedule(d, done, '2026-11-17T07:00:00Z')).status).toBe(409)
		const theirs = await appt(t, p.id, o.id)
		expect((await schedule(d, theirs, '2026-11-17T07:00:00Z')).status).toBe(404)
		expect((await schedule(d, 'nope', '2026-11-17T07:00:00Z')).status).toBe(404)
	})

	it('opted-out donors get no text; a failing provider never undoes the booking; no session, no booking', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { sms_opt_in: 0 }, { smsOptIn: false })
		const id = await appt(t, p.id, d.id)
		t.sms.sent.length = 0
		expect((await schedule(d, id, '2026-11-17T07:00:00Z')).status).toBe(200)
		expect(smsText()).toHaveLength(0)
		const q = await verifiedDonor(t, {}, { name: 'Mercy Wangari' })
		const id2 = await appt(t, q.id, d.id)
		const send = t.sms.send.bind(t.sms)
		t.sms.send = async () => {
			throw new Error('down')
		}
		const res = await schedule(d, id2, '2026-11-17T07:00:00Z')
		t.sms.send = send
		expect(res.status).toBe(200)
		expect((await schedule(d, id2, '2026-11-17T07:00:00Z', d.who.body.accessToken)).status).toBe(404)
	})

	it('warns (does not block) when 8 are already booked in that hour', async () => {
		const d = await checkinDesk(t)
		for (let i = 0; i < 8; i++) {
			const q = await donor(t, {}, { name: `Donor ${i}` })
			await appt(t, q.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-17 07:15:00' })
		}
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id)
		const res = await schedule(d, id, '2026-11-17T07:00:00Z')
		expect(res.status).toBe(200)
		expect((await json(res)).warning).toBe('busy')
	})

	it('the donor can ask to move a booked visit, and it then needs follow-up', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-17 07:00:00' })
		const res = await post(t, `/api/me/donation-requests/${id}/reschedule`, {}, auth(p.body.accessToken))
		expect(res.status).toBe(200)
		expect((await json(res)).rescheduleAsked).toBe(true)
		const fu = await json(await call(t, 'GET', dr(d.id, '?tab=follow_up'), d.token))
		expect(fu.items.map((x: any) => x.id)).toContain(id)
		const requested = await appt(t, p.id, d.id)
		expect((await post(t, `/api/me/donation-requests/${requested}/reschedule`, {}, auth(p.body.accessToken))).status).toBe(409)
		const other = await verifiedDonor(t, {}, { name: 'Mercy Wangari' })
		expect((await post(t, `/api/me/donation-requests/${id}/reschedule`, {}, auth(other.body.accessToken))).status).toBe(404)
	})
})
