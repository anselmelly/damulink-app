import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, makeTestApp, post, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { appt, checkinDesk, dr, verifiedDonor } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const smsText = () => t.sms.sent.filter((m) => !/your code is/i.test(m.text))
const go = (d: Awaited<ReturnType<typeof checkinDesk>>, id: string, what: 'decline' | 'cancel', body: unknown, token = d.token) => call(t, 'POST', dr(d.id, `/${id}/${what}`), token, body)

describe('declining and cancelling', () => {
	it('decline: the request is cancelled by the facility with a listed reason, the donor sees it and is texted plainly', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id)
		t.sms.sent.length = 0
		expect((await go(d, id, 'decline', { reason: 'no_capacity' })).status).toBe(200)
		expect((await rows(`select status, cancelled_by, cancel_reason from donation_requests where id = ?`, [id]))[0]).toEqual({ status: 'cancelled', cancelled_by: 'facility', cancel_reason: 'no_capacity' })
		const mine = await json(await get(t, '/api/me/donation-requests', auth(p.body.accessToken)))
		expect(mine[0]).toMatchObject({ status: 'cancelled', cancelledBy: 'facility', cancelReason: 'no_capacity' })
		expect(smsText()).toHaveLength(1)
		expect(smsText()[0].text).toMatch(/cannot take donations on that day/i)
		expect(smsText()[0].text).not.toMatch(/blood type|weight|iron|health/i)
	})

	it('cancel a booked visit: same reasons, same text', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-17 07:00:00' })
		t.sms.sent.length = 0
		expect((await go(d, id, 'cancel', { reason: 'other_facility' })).status).toBe(200)
		expect((await rows(`select status, cancelled_by from donation_requests where id = ?`, [id]))[0]).toMatchObject({ status: 'cancelled', cancelled_by: 'facility' })
		expect(smsText()[0].text).toMatch(/another medical facility/i)
	})

	it('only listed reasons; "other" needs a short note; a health-sounding free reason does not exist', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id)
		expect((await go(d, id, 'decline', { reason: 'low iron' })).status).toBe(422)
		expect((await go(d, id, 'decline', { reason: 'other' })).status).toBe(422)
		expect((await go(d, id, 'decline', { reason: 'other', note: 'x'.repeat(201) })).status).toBe(422)
		expect((await go(d, id, 'decline', { reason: 'other', note: 'Closed for cleaning' })).status).toBe(200)
		expect((await rows(`select cancel_note from donation_requests where id = ?`, [id]))[0].cancel_note).toBe('Closed for cleaning')
	})

	it('a decline is for requested ones, a cancel for booked ones; finished or already cancelled is 409', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const booked = await appt(t, p.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-17 07:00:00' })
		expect((await go(d, booked, 'decline', { reason: 'no_capacity' })).status).toBe(409)
		const asked = await appt(t, p.id, d.id)
		expect((await go(d, asked, 'cancel', { reason: 'no_capacity' })).status).toBe(409)
		const done = await appt(t, p.id, d.id, { status: 'completed' })
		expect((await go(d, done, 'cancel', { reason: 'no_capacity' })).status).toBe(409)
		await go(d, asked, 'decline', { reason: 'no_capacity' })
		expect((await go(d, asked, 'decline', { reason: 'no_capacity' })).status).toBe(409)
	})

	it('opted-out donors get no text; audited; another facility\'s request is 404; donors cannot use it', async () => {
		const d = await checkinDesk(t)
		const o = await checkinDesk(t)
		const p = await verifiedDonor(t, { sms_opt_in: 0 }, { smsOptIn: false })
		const id = await appt(t, p.id, d.id)
		t.sms.sent.length = 0
		await go(d, id, 'decline', { reason: 'no_capacity' })
		expect(smsText()).toHaveLength(0)
		expect(await rows(`select id from audit_log where action = 'donor_request.decline'`)).toHaveLength(1)
		const theirs = await appt(t, p.id, o.id)
		expect((await go(d, theirs, 'decline', { reason: 'no_capacity' })).status).toBe(404)
		expect((await go(d, id, 'decline', { reason: 'no_capacity' }, d.who.body.accessToken)).status).toBe(404)
	})

	it('the donor\'s own cancel is marked as the donor\'s', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const id = await appt(t, p.id, d.id)
		await post(t, `/api/me/donation-requests/${id}/cancel`, {}, auth(p.body.accessToken))
		expect((await rows(`select cancelled_by from donation_requests where id = ?`, [id]))[0].cancelled_by).toBe('donor')
	})
})
