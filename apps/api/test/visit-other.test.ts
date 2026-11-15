import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { checkinDesk, donor, outcome, verifiedDonor } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]

describe('test only, deferred, did not attend', () => {
	it('a test with the blood type now verifies the donor at once', async () => {
		const d = await checkinDesk(t)
		const p = await donor(t)
		const res = await outcome(t, d.token, d.id, p.code, { outcome: 'test', bloodType: 'B+' })
		expect(res.status).toBe(201)
		expect(await json(res)).toMatchObject({ outcome: 'test', verified: true })
		expect((await rows(`select blood_type from users where id = ?`, [p.id]))[0].blood_type).toBe('B+')
		expect(await rows(`select id from donations`)).toHaveLength(0)
		expect(await rows(`select id from lab_samples`)).toHaveLength(0)
	})

	it('a test with "later" queues a sample and verifies nobody; no weight needed', async () => {
		const d = await checkinDesk(t)
		const p = await donor(t)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'test', bloodType: 'later' })).status).toBe(201)
		expect((await rows(`select blood_type from users where id = ?`, [p.id]))[0].blood_type).toBeNull()
		expect(await rows(`select source, status from lab_samples where user_id = ?`, [p.id])).toEqual([{ source: 'test', status: 'pending' }])
	})

	it('a test for a verified donor with a different type is refused (type_conflict); the same type is fine', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { blood_type: 'O-' })
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'test', bloodType: 'A+' })).status).toBe(409)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'test', bloodType: 'O-' })).status).toBe(201)
	})

	it('deferred stores only the fact and a date; there is no reason field', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const res = await outcome(t, d.token, d.id, p.code, { outcome: 'deferred', returnAfter: '2027-01-04', reason: 'low iron' })
		expect(res.status).toBe(201)
		const [v] = await rows(`select * from visits where user_id = ?`, [p.id])
		expect(v.kind).toBe('deferred')
		expect(String(v.return_after)).toMatch(/2027|Jan 04/)
		expect(Object.keys(v).join(' ')).not.toMatch(/reason|note|health/)
		expect(JSON.stringify(await rows(`select * from audit_log`))).not.toContain('low iron')
	})

	it('a pause date must be today to 12 months ahead; none means no pause', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'deferred', returnAfter: '2026-11-01' })).status).toBe(422)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'deferred', returnAfter: '2028-01-01' })).status).toBe(422)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'deferred' })).status).toBe(201)
	})

	it('did not attend marks the booked visit missed and changes nothing else', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { last_donation_on: '2026-01-01' })
		await t.pool.query(`insert into donation_requests (id, user_id, facility_id, kind, days, time_of_day, status, scheduled_at, created_at, updated_at) values ('A1', ?, ?, 'donate', 'mon', 'any', 'scheduled', '2026-11-12 07:00:00', now(), now())`, [p.id, d.id])
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'no_show' })).status).toBe(201)
		expect((await rows(`select status from donation_requests where id = 'A1'`))[0].status).toBe('no_show')
		expect(String((await rows(`select last_donation_on from users where id = ?`, [p.id]))[0].last_donation_on)).toMatch(/2026-01-01|Jan 01 2026/)
	})

	it('a deferral cancels a booked visit as the facility\'s doing', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		await t.pool.query(`insert into donation_requests (id, user_id, facility_id, kind, days, time_of_day, status, scheduled_at, created_at, updated_at) values ('A1', ?, ?, 'donate', 'mon', 'any', 'scheduled', '2026-11-16 07:00:00', now(), now())`, [p.id, d.id])
		await outcome(t, d.token, d.id, p.code, { outcome: 'deferred' })
		expect((await rows(`select status from donation_requests where id = 'A1'`))[0].status).toBe('cancelled')
	})
})
