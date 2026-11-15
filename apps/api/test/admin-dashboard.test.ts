import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { admin, auth, json, makeTestApp, resetAccounts, signup } from './helpers'
import { desk } from './request-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
})
afterAll(() => t.pool.end())
const get = (token: string) => t.app.request('/api/admin/dashboard', { headers: auth(token) })

describe('the super admin dashboard', () => {
	it('counts what needs attention and shows the recent activity, newest first, at most 8', async () => {
		const a = await admin(t)
		await desk(t)
		await t.pool.query(`insert into user_flags (id, user_id, kind, reason, evidence, status, open_key, created_at) values ('01FLAG', ?, 'no_shows', 'x', '[]', 'open', 'k', now())`, [a.body.user.id])
		const res = await json(await get(a.body.accessToken))
		expect(res.counts).toMatchObject({ toVerify: 0, flagged: 1, facilitiesVerified: 1, suspended: 0, openCalls: 0, requestsToday: 0 })
		expect(res.oldest).toEqual([])
		expect(res.recent.length).toBeGreaterThan(0)
		expect(res.recent.length).toBeLessThanOrEqual(8)
		expect(res.recent[0]).toMatchObject({ who: expect.any(String), label: expect.any(String) })
	})
	it('lists the 3 oldest facilities waiting for review', async () => {
		const a = await admin(t)
		for (let i = 0; i < 4; i++) await t.pool.query(`insert into facilities (id, name, type, town, county, status, submitted_at) values (?, ?, 'hospital', 'Nakuru', 'Nakuru', 'pending', ?)`, [`01Q${i}`, `Queue ${i}`, `2026-11-0${i + 1} 08:00:00`])
		const res = await json(await get(a.body.accessToken))
		expect(res.counts.toVerify).toBe(4)
		expect(res.oldest.map((o: any) => o.name)).toEqual(['Queue 0', 'Queue 1', 'Queue 2'])
	})
	it('is for super admins only', async () => {
		expect((await t.app.request('/api/admin/dashboard')).status).toBe(401)
		const s = await signup(t)
		expect((await get(s.body.accessToken)).status).toBe(403)
	})
})
