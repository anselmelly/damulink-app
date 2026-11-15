import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getSetting } from '@damu/db'
import { admin, auth, json, makeTestApp, resetAccounts, signup } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const get = (token: string) => t.app.request('/api/admin/settings', { headers: auth(token) })
const patch = (token: string, changes: unknown) => t.app.request('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ changes }) })
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const field = (body: any, key: string) => body.groups.flatMap((g: any) => g.fields).find((f: any) => f.key === key)

describe('reading the settings', () => {
	it('lists the groups with the current value (or the default), unit and range', async () => {
		const a = await admin(t)
		const res = await get(a.body.accessToken)
		expect(res.status).toBe(200)
		const b = await json(res)
		expect(b.groups.map((g: any) => g.id)).toEqual(['eligibility', 'alerts', 'rings', 'requests', 'drives'])
		expect(field(b, 'eligibility.minAge')).toMatchObject({ value: 18, unit: 'years', min: 16, max: 30 })
		expect(field(b, 'eligibility.waitingMonthsFemale').value).toBe(4)
		expect(field(b, 'alert_limits.weeklyCap').value).toBe(3)
		expect(field(b, 'rings.ring2_km').value).toBe(10)
		expect(field(b, 'drives.max_open').value).toBe(10)
		expect(b.compatibility['A+']).toEqual(['O-', 'O+', 'A-', 'A+'])
	})
	it('is for super admins only', async () => {
		const s = await signup(t)
		expect((await get(s.body.accessToken)).status).toBe(403)
		expect((await t.app.request('/api/admin/settings')).status).toBe(401)
	})
})

describe('changing the settings', () => {
	it('saves only the changed keys, applies at once, and writes one audit row per key', async () => {
		const a = await admin(t)
		const res = await patch(a.body.accessToken, { 'eligibility.minAge': 17, 'alert_limits.weeklyCap': 5, 'drives.max_open': 12 })
		expect(res.status).toBe(200)
		expect(await getSetting(t.db, 'eligibility')).toMatchObject({ minAge: 17, maxAge: 65, minWeightKg: 50, waitingMonthsMale: 3, waitingMonthsFemale: 4 })
		expect(await getSetting(t.db, 'alert_limits')).toMatchObject({ weeklyCap: 5, quietFrom: 21, quietTo: 7 })
		expect(await getSetting(t.db, 'drives.max_open')).toBe(12)
		const log = await rows(`select actor_id, target, detail from audit_log where action = 'setting.change' order by id`)
		expect(log.map((l) => l.target).sort()).toEqual(['alert_limits.weeklyCap', 'drives.max_open', 'eligibility.minAge'])
		expect(log.find((l) => l.target === 'eligibility.minAge').detail).toBe('18 to 17')
		expect(field(await json(await get(a.body.accessToken)), 'eligibility.minAge').value).toBe(17)
	})
	it('a value that did not change writes nothing', async () => {
		const a = await admin(t)
		expect((await patch(a.body.accessToken, { 'eligibility.minAge': 18 })).status).toBe(200)
		expect(await rows(`select 1 from audit_log where action = 'setting.change'`)).toHaveLength(0)
	})
	it.each([
		['eligibility.minAge', 10],
		['eligibility.maxAge', 90],
		['eligibility.minWeightKg', 20],
		['alert_limits.weeklyCap', 0],
		['alert_limits.quietFrom', 24],
		['drives.max_open', 500],
		['rings.ring2_km', 'far'],
	])('refuses %s = %j and saves nothing', async (key, value) => {
		const a = await admin(t)
		const res = await patch(a.body.accessToken, { 'drives.max_ahead_days': 100, [key]: value })
		expect(res.status).toBe(422)
		expect((await json(res)).error.fields[key]).toBeTruthy()
		expect(await getSetting(t.db, 'drives.max_ahead_days')).toBeUndefined()
		expect(await rows(`select 1 from audit_log where action = 'setting.change'`)).toHaveLength(0)
	})
	it('the minimum age must stay below the maximum, and ring 2 inside ring 3', async () => {
		const a = await admin(t)
		expect((await patch(a.body.accessToken, { 'eligibility.minAge': 30, 'eligibility.maxAge': 50 })).status).toBe(200)
		expect((await patch(a.body.accessToken, { 'eligibility.minAge': 30, 'eligibility.maxAge': 29 })).status).toBe(422)
		expect((await patch(a.body.accessToken, { 'rings.ring2_km': 40, 'rings.ring3_km': 30 })).status).toBe(422)
	})
	it('a key that is not on the list can never be written', async () => {
		const a = await admin(t)
		const res = await patch(a.body.accessToken, { 'jwt.secret': 1, 'eligibility.minAge': 17 })
		expect(res.status).toBe(422)
		expect(await getSetting(t.db, 'jwt.secret')).toBeUndefined()
		expect(await getSetting(t.db, 'eligibility')).toBeUndefined()
	})
	it('a donor and a facility admin cannot change them', async () => {
		const s = await signup(t)
		expect((await patch(s.body.accessToken, { 'drives.max_open': 12 })).status).toBe(403)
	})
	it('the new eligibility values are used by the next check', async () => {
		const a = await admin(t)
		await patch(a.body.accessToken, { 'eligibility.waitingMonthsFemale': 6 })
		const { getEligibilitySettings } = await import('../src/lib/eligibility')
		expect((await getEligibilitySettings(t.db)).waitingMonthsFemale).toBe(6)
	})
})
