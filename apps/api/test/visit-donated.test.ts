import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { checkinDesk, donor, lookup, outcome, verifiedDonor } from './checkin-helpers'
import { live } from './call-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]

describe('outcome: donated', () => {
	it('records the donation, the weight, the bag and the next eligible date', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const res = await outcome(t, d.token, d.id, p.code, { outcome: 'donated', weightKg: 62.5, bagNumber: 'RC-1171' })
		expect(res.status).toBe(201)
		expect(await json(res)).toMatchObject({ outcome: 'donated', nextEligibleOn: '2027-03-14' }) // a woman waits 4 months
		const [don] = await rows(`select * from donations where user_id = ?`, [p.id])
		expect(don).toMatchObject({ facility_id: d.id, bag_number: 'RC-1171', recorded_by: d.attendant.body.user.id })
		expect(String(don.donated_on)).toContain('2026')
		const [u] = await rows(`select weight_kg, last_donation_on from users where id = ?`, [p.id])
		expect(Number(u.weight_kg)).toBe(62.5)
		expect(String(u.last_donation_on)).toMatch(/2026-11-14|Nov 14 2026/)
		expect(await rows(`select kind from visits where user_id = ?`, [p.id])).toEqual([{ kind: 'donated' }])
		expect(await rows(`select id from lab_samples where user_id = ?`, [p.id])).toHaveLength(0) // already verified
	})

	it('a man waits 3 months', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, {}, { sex: 'male', name: 'Daniel Cheruiyot' })
		expect((await json(await outcome(t, d.token, d.id, p.code, { outcome: 'donated' }))).nextEligibleOn).toBe('2027-02-14')
	})

	it('no weight leaves the weight on file alone; under 50 kg is allowed with a warning', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { weight_kg: 70 })
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'donated' })).status).toBe(201)
		expect(Number((await rows(`select weight_kg from users where id = ?`, [p.id]))[0].weight_kg)).toBe(70)
		const q = await verifiedDonor(t)
		const res = await outcome(t, d.token, d.id, q.code, { outcome: 'donated', weightKg: 47 })
		expect(res.status).toBe(201)
		expect((await json(res)).warning).toBe('weight_low')
	})

	it('inside the waiting period is refused with the date, and nothing is written', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { last_donation_on: '2026-10-20' })
		const res = await outcome(t, d.token, d.id, p.code, { outcome: 'donated' })
		expect(res.status).toBe(409)
		const e = (await json(res)).error
		expect(e.code).toBe('not_eligible')
		expect(e.fields.eligibleOn).toBe('2027-02-20')
		expect(await rows(`select id from donations`)).toHaveLength(0)
		expect(await rows(`select id from visits`)).toHaveLength(0)
	})

	it('an unverified donor: the donation counts and a lab sample is queued for the type', async () => {
		const d = await checkinDesk(t)
		const p = await donor(t)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'donated', bagNumber: 'RC-9' })).status).toBe(201)
		const [s] = await rows(`select * from lab_samples where user_id = ?`, [p.id])
		expect(s).toMatchObject({ facility_id: d.id, source: 'donation', status: 'pending', sample_ref: 'RC-9' })
	})

	it('a donation counts toward a call: the donor\'s YES row becomes donated, or is created', async () => {
		const l = await live(t, { bloodType: 'A+', units: 2 })
		const tok = l.attendant.body.accessToken
		const p = await verifiedDonor(t)
		const res = await outcome(t, tok, l.id, p.code, { outcome: 'donated', callId: l.c.id })
		expect(res.status).toBe(201)
		expect((await json(res)).call).toMatchObject({ number: l.c.number, donated: 1, needed: 2 })
		const [r] = await rows(`select status, ring, donation_id from call_responses where call_id = ? and user_id = ?`, [l.c.id, p.id])
		expect(r.status).toBe('donated')
		expect(r.ring).toBe(0)
		expect(r.donation_id).toBeTruthy()
		// a donor who had said YES keeps their ring
		const q = await verifiedDonor(t)
		await t.pool.query(`insert into call_responses (id, call_id, user_id, ring, status, replied_at) values ('R1', ?, ?, 2, 'willing', now())`, [l.c.id, q.id])
		await outcome(t, tok, l.id, q.code, { outcome: 'donated', callId: l.c.id })
		expect((await rows(`select status, ring from call_responses where id = 'R1'`))[0]).toMatchObject({ status: 'donated', ring: 2 })
	})

	it('a call of another facility, a closed call or a type that does not fit is 422', async () => {
		const l = await live(t, { bloodType: 'A+' })
		const p = await verifiedDonor(t, { blood_type: 'B+' }) // B+ does not give to A+
		expect((await outcome(t, l.attendant.body.accessToken, l.id, p.code, { outcome: 'donated', callId: l.c.id })).status).toBe(422)
		expect((await outcome(t, l.attendant.body.accessToken, l.id, p.code, { outcome: 'donated', callId: 'nope' })).status).toBe(422)
	})

	it('a booked visit here is completed', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		await t.pool.query(`insert into donation_requests (id, user_id, facility_id, kind, days, time_of_day, status, scheduled_at, created_at, updated_at) values ('A1', ?, ?, 'donate', 'mon', 'any', 'scheduled', '2026-11-16 07:00:00', now(), now())`, [p.id, d.id])
		await outcome(t, d.token, d.id, p.code, { outcome: 'donated' })
		expect((await rows(`select status from donation_requests where id = 'A1'`))[0].status).toBe('completed')
	})

	it('needs the facility team, a verified donor code, and sane input', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		expect((await outcome(t, d.token, d.id, 'DL-2222-22', { outcome: 'donated' })).status).toBe(404)
		expect((await outcome(t, d.who.body.accessToken, d.id, p.code, { outcome: 'donated' })).status).toBe(404)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'donated', weightKg: 5 })).status).toBe(422)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'burned' })).status).toBe(422)
		expect((await lookup(t, d.token, d.id, p.code)).status).toBe(200)
	})
})
