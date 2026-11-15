import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedDemo } from '../src/lib/demo-seed'
import { addFacility, json, makeTestApp, post, resetAccounts } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const run = () => seedDemo(t.db, { password: 'demo-password-123', iterations: 1000, now: t.clock.now() })
const counts = async () => Object.fromEntries(await Promise.all(['facilities', 'users', 'facility_members', 'blood_requests', 'calls', 'drives', 'drive_interest'].map(async (n) => [n, (await rows(`select count(*) c from ${n}`))[0].c])))

describe('the demo seeder', () => {
	it('makes the facilities, a team for each verified one, donors, and a request, a call and a drive at Rift County Hospital', async () => {
		const s = await run()
		expect(s.facilities).toBe(10)
		const c = await counts()
		expect(c.facilities).toBe(10)
		expect(c.facility_members).toBe(18) // an admin and an attendant at each of the 9 verified facilities
		expect(c.users).toBeGreaterThan(18 + 10)
		expect(c.blood_requests).toBeGreaterThan(3)
		expect(c.calls).toBeGreaterThan(0)
		expect(c.drives).toBeGreaterThan(0)
		const [rejected] = await rows(`select status from facilities where name = 'Sunrise Clinic'`)
		expect(rejected.status).toBe('rejected')
	})

	it('a demo admin and attendant log in with the facility code, with hashed passwords', async () => {
		await run()
		const [f] = await rows(`select id, facility_code from facilities where name = 'Rift County Hospital'`)
		const members = await rows(`select u.email, u.password_hash, m.role from facility_members m join users u on u.id = m.user_id where m.facility_id = ?`, [f.id])
		expect(members.map((m) => m.role).sort()).toEqual(['admin', 'attendant'])
		for (const m of members) {
			expect(m.password_hash).not.toContain('demo-password-123')
			const res = await post(t, '/api/auth/login', { email: m.email, password: 'demo-password-123', facilityCode: f.facility_code })
			expect(res.status).toBe(200)
			expect((await json(res)).facility.role).toBe(m.role)
		}
	})

	it('running it again adds nothing and changes nothing', async () => {
		await run()
		const before = await counts()
		const [hash] = await rows(`select password_hash from users order by email limit 1`)
		const again = await seedDemo(t.db, { password: 'another-password', iterations: 1000, now: t.clock.now() })
		expect(again.createdAccounts).toBe(0)
		expect(await counts()).toEqual(before)
		expect((await rows(`select password_hash from users order by email limit 1`))[0]).toEqual(hash)
	})

	it('never touches a real facility, even one with the same name, and gives it no demo team', async () => {
		const real = await addFacility(t, 'Rift County Hospital', 'Nakuru', 'verified')
		await t.pool.query(`update facilities set license_number = 'REAL-1' where id = ?`, [real])
		const s = await run()
		expect(s.skipped).toContain('Rift County Hospital')
		const same = await rows(`select id, license_number from facilities where name = 'Rift County Hospital'`)
		expect(same).toHaveLength(1)
		expect(same[0].license_number).toBe('REAL-1')
		expect(await rows(`select 1 from facility_members where facility_id = ?`, [same[0].id])).toHaveLength(0)
		expect(await rows(`select 1 from blood_requests where facility_id = ?`, [same[0].id])).toHaveLength(0)
	})

	it('demo donors are verified, with a blood type and a phone, and everyone uses the demo email domain', async () => {
		await run()
		const donors = await rows(`select blood_type, phone_verified_at, donor_code, email from users where donor_code is not null`)
		expect(donors.length).toBeGreaterThanOrEqual(12)
		for (const d of donors) {
			expect(d.blood_type).toBeTruthy()
			expect(d.phone_verified_at).toBeTruthy()
			expect(d.email).toMatch(/@demo\.example$/)
		}
		expect((await rows(`select email from users where email not like '%@demo.example'`))).toHaveLength(0)
	})
})
