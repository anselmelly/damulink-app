import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { admin, auth, json, login, makeTestApp, resetAccounts, signup } from './helpers'
import { tick } from './alert-helpers'
import { call, desk, fq, sent } from './request-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
})
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const flags = async (token: string, qs = '') => json(await t.app.request(`/api/admin/flags${qs}`, { headers: auth(token) }))
const post = (token: string, path: string, body?: unknown) => t.app.request(`/api/admin/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body ?? {}) })

async function rejectMany(d: Awaited<ReturnType<typeof desk>>, n: number) {
	for (let i = 0; i < n; i++) {
		const r = await sent(t, d.who.body.accessToken, d.id)
		await call(t, 'POST', fq(d.id, `/${r.id}/reject`), d.adminToken, { reason: 'no_match' })
	}
}

describe('raising flags (in the cron tick)', () => {
	it('a requester with 3 requests rejected in 7 days is flagged once, with the evidence', async () => {
		const d = await desk(t)
		const a = await admin(t)
		await rejectMany(d, 3)
		await tick(t)
		await tick(t)
		const f = await flags(a.body.accessToken)
		expect(f.open).toBe(1)
		expect(f.items).toHaveLength(1)
		expect(f.items[0]).toMatchObject({ kind: 'rejected_requests', reason: '3 requests rejected in 7 days', person: { id: d.who.body.user.id, name: d.who.body.user.name, role: 'Requester' } })
		expect(f.items[0].person.phone).toMatch(/^\+254 [17]•• ••• \d{3}$/)
		expect(f.items[0].evidence).toHaveLength(3)
		expect(f.items[0].evidence[0].ref).toMatch(/^REQ-\d+/)
		expect(JSON.stringify(f)).not.toMatch(/Test Patient|Ward \d/)
		expect((await rows(`select actor_id from audit_log where action = 'user.flag'`))).toHaveLength(1)
	})
	it('2 rejections, or old ones, raise nothing', async () => {
		const d = await desk(t)
		const a = await admin(t)
		await rejectMany(d, 2)
		await tick(t)
		expect((await flags(a.body.accessToken)).open).toBe(0)
		await t.pool.query(`update blood_requests set decided_at = '2026-11-01 08:00:00' where status = 'rejected'`) // now older than 7 days
		const e = await desk(t)
		await rejectMany(e, 1)
		await tick(t)
		expect((await flags(a.body.accessToken)).open).toBe(0)
	})
	it('a donor marked no-show by 2 different facilities in 30 days is flagged; the same facility twice is not', async () => {
		const d1 = await desk(t)
		const d2 = await desk(t)
		const a = await admin(t)
		const donor = await signup(t)
		const other = await signup(t)
		const visit = (user: string, fac: string, i: number) => t.pool.query(`insert into visits (id, user_id, facility_id, kind, recorded_by, created_at) values (?, ?, ?, 'no_show', ?, '2026-11-10 08:00:00')`, [`V${i}`.padEnd(26, '0'), user, fac, d1.attendant.body.user.id])
		await visit(donor.body.user.id, d1.id, 1)
		await visit(donor.body.user.id, d2.id, 2)
		await visit(other.body.user.id, d1.id, 3)
		await visit(other.body.user.id, d1.id, 4)
		await tick(t)
		const f = await flags(a.body.accessToken)
		expect(f.items).toHaveLength(1)
		expect(f.items[0]).toMatchObject({ kind: 'no_shows', person: { id: donor.body.user.id, role: 'Donor' } })
		expect(f.items[0].reason).toBe('Did not attend after booking at 2 facilities in 30 days')
	})
	it('a dismissed flag does not come back for the same evidence, but three new rejections after it raise a new one', async () => {
		const d = await desk(t)
		const a = await admin(t)
		await rejectMany(d, 3)
		await tick(t)
		const id = (await flags(a.body.accessToken)).items[0].id
		expect((await post(a.body.accessToken, `flags/${id}/dismiss`, { note: 'Checked, fine' })).status).toBe(200)
		await tick(t)
		expect((await flags(a.body.accessToken)).open).toBe(0)
		expect((await rows(`select status, note, resolved_by from user_flags`))[0]).toMatchObject({ status: 'dismissed', note: 'Checked, fine', resolved_by: a.body.user.id })
		expect(await rows(`select 1 from audit_log where action = 'flag.dismiss'`)).toHaveLength(1)
		clock.set('2026-11-14T21:05:00Z') // next Nairobi day: the daily request cap resets
		const fresh = async (u: any) => (await json(await login(t, u.input.email, u.input.password))).accessToken
		for (let i = 0; i < 3; i++) {
			const r = await sent(t, await fresh(d.who), d.id, { neededBy: '2026-11-20T08:00:00Z' })
			await call(t, 'POST', fq(d.id, `/${r.id}/reject`), await fresh(d.owner), { reason: 'no_match' })
		}
		await tick(t)
		const again = (await json(await login(t, a.input.email, a.input.password))).accessToken
		expect((await flags(again)).open).toBe(1)
	})
})

describe('suspending and reactivating', () => {
	it('suspends: no sign-in, sessions revoked, open requests cancelled, flags actioned, logged', async () => {
		const d = await desk(t)
		const a = await admin(t)
		const open = await sent(t, d.who.body.accessToken, d.id)
		await t.pool.query(`insert into user_flags (id, user_id, kind, reason, evidence, status, open_key, created_at) values ('01FLAG', ?, 'rejected_requests', '3 requests rejected in 7 days', '[]', 'open', ?, now())`, [d.who.body.user.id, `${d.who.body.user.id}:rejected_requests`])
		const res = await post(a.body.accessToken, `users/${d.who.body.user.id}/suspend`, { reason: 'Repeated false requests' })
		expect(res.status).toBe(200)
		expect((await rows(`select status from users where id = ?`, [d.who.body.user.id]))[0].status).toBe('suspended')
		expect((await login(t, d.who.input.email, d.who.input.password)).status).toBe(403)
		expect((await rows(`select status from blood_requests where id = ?`, [open.id]))[0].status).toBe('cancelled')
		expect(await rows(`select 1 from refresh_tokens where user_id = ? and revoked_at is null`, [d.who.body.user.id])).toHaveLength(0)
		expect((await rows(`select status from user_flags`))[0].status).toBe('actioned')
		expect((await rows(`select detail from audit_log where action = 'user.suspend'`))[0].detail).toContain('Repeated false requests')
		expect((await flags(a.body.accessToken)).open).toBe(0)
	})
	it('needs a reason; not yourself, not another super admin; an unknown user is 404', async () => {
		const a = await admin(t)
		const b = await admin(t)
		const s = await signup(t)
		expect((await post(a.body.accessToken, `users/${s.body.user.id}/suspend`, {})).status).toBe(422)
		expect((await post(a.body.accessToken, `users/${a.body.user.id}/suspend`, { reason: 'x'.repeat(5) })).status).toBe(409)
		expect((await post(a.body.accessToken, `users/${b.body.user.id}/suspend`, { reason: 'x'.repeat(5) })).status).toBe(409)
		expect((await post(a.body.accessToken, 'users/nope/suspend', { reason: 'x'.repeat(5) })).status).toBe(404)
	})
	it('reactivates, and logs it', async () => {
		const a = await admin(t)
		const s = await signup(t)
		await post(a.body.accessToken, `users/${s.body.user.id}/suspend`, { reason: 'Testing it' })
		expect((await post(a.body.accessToken, `users/${s.body.user.id}/reactivate`)).status).toBe(200)
		expect((await login(t, s.input.email, s.input.password)).status).toBe(200)
		expect(await rows(`select 1 from audit_log where action = 'user.reactivate'`)).toHaveLength(1)
	})
	it('only super admins use any of it', async () => {
		const s = await signup(t)
		expect((await t.app.request('/api/admin/flags', { headers: auth(s.body.accessToken) })).status).toBe(403)
		expect((await post(s.body.accessToken, `users/${s.body.user.id}/suspend`, { reason: 'Testing it' })).status).toBe(403)
	})
})
