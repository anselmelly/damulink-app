import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { appt, checkinDesk, donor, dr, verifiedDonor } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const list = async (d: Awaited<ReturnType<typeof checkinDesk>>, tab: string, token = d.token) => json(await call(t, 'GET', dr(d.id, `?tab=${tab}`), token))

describe('donor requests: the facility\'s lists', () => {
	it('follow up: requested ones and booked ones the donor asked to move, oldest first, with counts', async () => {
		const d = await checkinDesk(t)
		const a = await verifiedDonor(t)
		const b = await donor(t, {}, { name: 'Daniel Cheruiyot', sex: 'male' })
		const c = await verifiedDonor(t, {}, { name: 'Mercy Wangari' })
		await appt(t, a.id, d.id, { created_at: '2026-11-13 09:00:00', days: 'mon,wed', time_of_day: 'morning' })
		await appt(t, b.id, d.id, { created_at: '2026-11-12 09:00:00', kind: 'test' })
		await appt(t, c.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-17 07:00:00', reschedule_asked: 1, created_at: '2026-11-11 09:00:00' })
		const r = await list(d, 'follow_up')
		expect(r.items.map((x: any) => x.name)).toEqual(['Mercy Wangari', 'Daniel Cheruiyot', 'Faith Wambui'])
		expect(r.items[0].rescheduleAsked).toBe(true)
		expect(r.items[1]).toMatchObject({ kind: 'test', verified: false, code: b.code })
		expect(r.items[2]).toMatchObject({ kind: 'donate', verified: true, days: ['mon', 'wed'], timeOfDay: 'morning' })
		expect(r.counts).toEqual({ follow_up: 3, scheduled: 1, past: 0 })
	})

	it('scheduled: soonest first; past: completed, no-show and cancelled with who and why', async () => {
		const d = await checkinDesk(t)
		const a = await verifiedDonor(t)
		const b = await verifiedDonor(t, {}, { name: 'Daniel Cheruiyot', sex: 'male' })
		const c = await verifiedDonor(t, {}, { name: 'Mercy Wangari' })
		await appt(t, a.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-18 07:00:00' })
		await appt(t, b.id, d.id, { status: 'scheduled', scheduled_at: '2026-11-16 07:00:00' })
		expect((await list(d, 'scheduled')).items.map((x: any) => x.name)).toEqual(['Daniel Cheruiyot', 'Faith Wambui'])
		const id = await appt(t, c.id, d.id, { status: 'cancelled' })
		await t.pool.query(`update donation_requests set cancelled_by = 'facility', cancel_reason = 'no_capacity' where id = ?`, [id])
		await appt(t, a.id, d.id, { status: 'completed' })
		const past = await list(d, 'past')
		expect(past.items).toHaveLength(2)
		expect(past.items.find((x: any) => x.status === 'cancelled')).toMatchObject({ cancelledBy: 'facility', cancelReason: 'no_capacity' })
	})

	it('a donation shows a one-line eligibility note, a test shows none', async () => {
		const d = await checkinDesk(t)
		const a = await verifiedDonor(t, { last_donation_on: '2026-10-20' })
		const b = await verifiedDonor(t, {}, { name: 'Mercy Wangari' })
		await appt(t, a.id, d.id)
		await appt(t, b.id, d.id, { kind: 'test' })
		const items = (await list(d, 'follow_up')).items
		expect(items.find((x: any) => x.name === 'Faith Wambui').note).toMatch(/20 February 2027/)
		expect(items.find((x: any) => x.name === 'Mercy Wangari').note).toBeNull()
	})

	it('never shows another facility\'s requests, a phone, an email or a date of birth', async () => {
		const d = await checkinDesk(t)
		const o = await checkinDesk(t)
		const a = await verifiedDonor(t)
		await appt(t, a.id, o.id)
		expect((await list(d, 'follow_up')).items).toEqual([])
		await appt(t, a.id, d.id)
		const text = JSON.stringify(await list(d, 'follow_up'))
		for (const bad of [a.input.email, a.input.phone, '1995-05-10', 'phone', 'email']) expect(text).not.toContain(bad)
	})

	it('a bad tab is 422; a donor session or a non-member is 404', async () => {
		const d = await checkinDesk(t)
		const o = await checkinDesk(t)
		expect((await call(t, 'GET', dr(d.id, '?tab=nope'), d.token)).status).toBe(422)
		expect((await call(t, 'GET', dr(d.id, '?tab=follow_up'), d.who.body.accessToken)).status).toBe(404)
		expect((await call(t, 'GET', dr(d.id, '?tab=follow_up'), o.token)).status).toBe(404)
	})
})
