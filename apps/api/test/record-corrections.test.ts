import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { fresh } from './call-helpers'
import { checkinDesk, donor, outcome, rec } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const fix = (d: Awaited<ReturnType<typeof checkinDesk>>, code: string, body: unknown, token = d.token) => call(t, 'POST', rec(d.id, code, '/correct'), token, body)

/** A donor tested and then donated at this desk today: the facility made both the blood type and the donation. */
async function made(d: Awaited<ReturnType<typeof checkinDesk>>) {
	const p = await donor(t)
	await outcome(t, d.token, d.id, p.code, { outcome: 'test', bloodType: 'A+' })
	t.clock.advance(60_000)
	await outcome(t, d.token, d.id, p.code, { outcome: 'donated', weightKg: 60 })
	return p
}

describe('corrections', () => {
	it('a team member fixes weight, blood type and the donation date within 24 hours', async () => {
		const d = await checkinDesk(t)
		const p = await made(d)
		const res = await fix(d, p.code, { bloodType: 'O-', weightKg: 62.5, lastDonationOn: '2026-11-12', reason: 'lab_differed', note: 'Re-run' })
		expect(res.status).toBe(200)
		const [u] = await rows(`select blood_type, weight_kg, last_donation_on from users where id = ?`, [p.id])
		expect(u.blood_type).toBe('O-')
		expect(Number(u.weight_kg)).toBe(62.5)
		expect(String(u.last_donation_on)).toMatch(/2026-11-12|Nov 12 2026/)
		expect(String((await rows(`select donated_on from donations where user_id = ?`, [p.id]))[0].donated_on)).toMatch(/2026-11-12|Nov 12 2026/)
		expect(await rows(`select field from record_corrections where user_id = ?`, [p.id])).toHaveLength(3)
	})

	it('an attendant is locked out of an older record; an admin is not', async () => {
		const d = await checkinDesk(t)
		const p = await made(d)
		t.clock.advance(25 * 3600_000)
		const [att, adm] = [await fresh(t, d.attendant), await fresh(t, d.owner)]
		const a = await call(t, 'POST', rec(d.id, p.code, '/correct'), att, { weightKg: 61, reason: 'reweighed' })
		expect(a.status).toBe(403)
		expect((await json(a)).error.code).toBe('locked')
		const v = await json(await call(t, 'GET', rec(d.id, p.code), att))
		expect(v.locked).toBe(true)
		expect((await fix(d, p.code, { weightKg: 61, reason: 'reweighed' }, adm)).status).toBe(200)
		expect((await json(await call(t, 'GET', rec(d.id, p.code), adm))).locked).toBe(false)
	})

	it('needs a listed reason and at least one change', async () => {
		const d = await checkinDesk(t)
		const p = await made(d)
		expect((await fix(d, p.code, { weightKg: 61 })).status).toBe(422)
		expect((await fix(d, p.code, { weightKg: 61, reason: 'because' })).status).toBe(422)
		expect((await fix(d, p.code, { reason: 'typo' })).status).toBe(422)
		expect(await rows(`select id from record_corrections`)).toHaveLength(0)
	})

	it('refuses impossible values', async () => {
		const d = await checkinDesk(t)
		const p = await made(d)
		expect((await fix(d, p.code, { weightKg: 400, reason: 'typo' })).status).toBe(422)
		expect((await fix(d, p.code, { lastDonationOn: '2026-12-01', reason: 'typo' })).status).toBe(422) // future
		expect((await fix(d, p.code, { lastDonationOn: '2010-01-01', reason: 'typo' })).status).toBe(422) // before 18
		// overlaps the waiting period after an earlier donation
		await t.pool.query(`insert into donations (id, user_id, facility_id, donated_on, recorded_by, created_at) values ('EARLY', ?, ?, '2026-06-15', ?, now())`, [p.id, d.id, d.attendant.body.user.id])
		expect((await fix(d, p.code, { lastDonationOn: '2026-10-01', reason: 'typo' })).status).toBe(422)
		expect((await fix(d, p.code, { lastDonationOn: '2026-11-13', reason: 'typo' })).status).toBe(200)
	})

	it('another facility\'s donor is 404; a blood type verified elsewhere cannot be changed here', async () => {
		const d = await checkinDesk(t)
		const o = await checkinDesk(t)
		const p = await made(d)
		expect((await call(t, 'GET', rec(o.id, p.code), o.token)).status).toBe(404)
		expect((await fix(o, p.code, { weightKg: 61, reason: 'typo' }, o.token)).status).toBe(404)
		await t.pool.query(`update users set blood_type_facility_id = ? where id = ?`, [o.id, p.id])
		const res = await fix(d, p.code, { bloodType: 'O-', reason: 'typo' })
		expect(res.status).toBe(409)
		expect((await json(res)).error.code).toBe('not_your_record')
		expect((await fix(d, p.code, { weightKg: 61, reason: 'typo' })).status).toBe(200)
	})

	it('the log shows old and new values, who and when, newest first, to this facility only', async () => {
		const d = await checkinDesk(t)
		const p = await made(d)
		await fix(d, p.code, { weightKg: 61, reason: 'reweighed' })
		t.clock.advance(60_000)
		await fix(d, p.code, { weightKg: 62, reason: 'typo', note: 'Slip' }, d.adminToken)
		const v = await json(await call(t, 'GET', rec(d.id, p.code), d.token))
		expect(v.log.map((x: any) => [x.field, x.oldValue, x.newValue, x.reason])).toEqual([['weight', '61', '62', 'typo'], ['weight', '60', '61', 'reweighed']])
		expect(v.log[0]).toMatchObject({ note: 'Slip', by: d.owner.body.user.name })
		expect(v).toMatchObject({ name: 'Faith Wambui', code: p.code, bloodType: 'A+', own: { bloodType: true, donation: true } })
		expect((await call(t, 'GET', rec(d.id, p.code), d.who.body.accessToken)).status).toBe(404)
	})

	it('the donor is not messaged and the correction is audited', async () => {
		const d = await checkinDesk(t)
		const p = await made(d)
		t.sms.sent.length = 0
		await fix(d, p.code, { weightKg: 61, reason: 'typo' })
		expect(t.sms.sent).toHaveLength(0)
		expect(await rows(`select id from audit_log where action = 'record.correct'`)).toHaveLength(1)
	})
})
