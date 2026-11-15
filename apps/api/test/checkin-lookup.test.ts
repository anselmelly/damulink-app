import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts, signup } from './helpers'
import { call } from './request-helpers'
import { checkinDesk, ck, donor, lookup, verifiedDonor } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('check-in lookup', () => {
	it('an eligible, verified donor: the card and the three checks', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { weight_kg: 62, last_donation_on: '2026-03-14' })
		const res = await lookup(t, d.token, d.id, p.code)
		expect(res.status).toBe(200)
		const c = await json(res)
		expect(c).toMatchObject({ code: p.code, name: 'Faith Wambui', sex: 'female', age: 31, verified: true, bloodType: 'O-', weightKg: 62, lastDonationOn: '2026-03-14', donations: 0 })
		expect(c.eligibility.status).toBe('eligible')
		expect(c.checks.map((x: any) => x.key)).toEqual(['age', 'weight', 'waiting'])
		expect(c.checks.every((x: any) => x.ok)).toBe(true)
	})

	it('inside the waiting period: the date they can give again', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { last_donation_on: '2026-10-20' })
		const c = await json(await lookup(t, d.token, d.id, p.code))
		expect(c.eligibility).toMatchObject({ status: 'waiting', eligibleOn: '2027-02-20' })
		expect(c.checks.find((x: any) => x.key === 'waiting').ok).toBe(false)
	})

	it('not verified yet: a registered donor, no blood type', async () => {
		const d = await checkinDesk(t)
		const p = await donor(t)
		const c = await json(await lookup(t, d.token, d.id, p.code))
		expect(c).toMatchObject({ verified: false, bloodType: null, weightKg: null })
	})

	it('a weight under 50 kg is only a warning, never a failing check', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { weight_kg: 47 })
		const c = await json(await lookup(t, d.token, d.id, p.code))
		expect(c.eligibility.status).toBe('eligible')
		expect(c.eligibility.weightAdvisory).toBe(true)
		expect(c.checks.find((x: any) => x.key === 'weight')).toMatchObject({ advisory: true })
	})

	it('shows the age, never the date of birth; no phone, email or address anywhere', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const text = await (await lookup(t, d.token, d.id, p.code)).text()
		for (const secret of ['1995-05-10', p.input.email, p.input.phone, p.input.phone.slice(-6), 'dateOfBirth', 'phone', 'email']) expect(text).not.toContain(secret)
	})

	it('forgives case, spaces and missing dashes', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const squashed = p.code.replace(/-/g, '').toLowerCase()
		expect((await lookup(t, d.token, d.id, squashed)).status).toBe(200)
		expect((await lookup(t, d.token, d.id, ` ${p.code.toLowerCase().replace(/-/g, ' ')} `)).status).toBe(200)
	})

	it('unknown, malformed, under-18, suspended: all the same 404', async () => {
		const d = await checkinDesk(t)
		const kid = await signup(t, { dateOfBirth: '2012-01-01' })
		const gone = await verifiedDonor(t)
		await t.pool.query(`update users set status = 'suspended' where id = ?`, [gone.id])
		const bodies: string[] = []
		for (const code of ['DL-2222-22', 'nonsense', kid.body.user.donorCode ?? 'DL-3333-33', gone.code]) {
			const res = await lookup(t, d.token, d.id, code)
			expect(res.status).toBe(404)
			bodies.push(await res.text())
		}
		expect(new Set(bodies).size).toBe(1)
	})

	it('counts the donations on record and audits the lookup without health data', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		for (const on of ['2025-01-01', '2025-06-01']) await t.pool.query(`insert into donations (id, user_id, facility_id, donated_on, recorded_by, created_at) values (?, ?, ?, ?, ?, now())`, [`D${on}`, p.id, d.id, on, d.attendant.body.user.id])
		expect((await json(await lookup(t, d.token, d.id, p.code))).donations).toBe(2)
		const [rows]: any = await t.pool.query(`select detail from audit_log where action = 'checkin.lookup'`)
		expect(rows).toHaveLength(1)
		expect(JSON.stringify(rows)).not.toMatch(/O-|Faith|eligible/i)
	})

	it('is for the team of a verified facility only', async () => {
		const d = await checkinDesk(t)
		const other = await checkinDesk(t)
		const p = await verifiedDonor(t)
		expect((await lookup(t, other.token, d.id, p.code)).status).toBe(404) // not a member
		expect((await call(t, 'GET', ck(d.id, p.code), d.who.body.accessToken)).status).toBe(404) // a requester
		expect((await call(t, 'GET', ck(d.id, p.code), '')).status).toBe(401)
	})

	it('is rate limited per person (default 30 in ten minutes)', async () => {
		const d = await checkinDesk(t)
		for (let i = 0; i < 30; i++) expect((await lookup(t, d.token, d.id, 'DL-2222-22')).status).toBe(404)
		expect((await lookup(t, d.token, d.id, 'DL-2222-22')).status).toBe(429)
	})

	it('shows live calls at this facility that fit the donor and a booked visit here', async () => {
		const { live } = await import('./call-helpers')
		const l = await live(t, { bloodType: 'A+', units: 2 })
		const p = await verifiedDonor(t, {}, {})
		await t.pool.query(`insert into donation_requests (id, user_id, facility_id, kind, days, time_of_day, status, scheduled_at, created_at, updated_at) values ('APPT1', ?, ?, 'donate', 'mon', 'any', 'scheduled', '2026-11-16 07:00:00', now(), now())`, [p.id, l.id])
		const c = await json(await lookup(t, l.attendant.body.accessToken, l.id, p.code))
		expect(c.calls).toHaveLength(1)
		expect(c.calls[0]).toMatchObject({ number: l.c.number, needed: 2 })
		expect(c.appointment).toMatchObject({ id: 'APPT1', kind: 'donate' })
	})
})
