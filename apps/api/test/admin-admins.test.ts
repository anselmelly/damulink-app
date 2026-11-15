import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, auth, json, makeTestApp, resetAccounts, signup, verifyEmail } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const call = (method: string, path: string, token: string, body?: unknown) => t.app.request(`/api/admin/admins${path}`, { method, headers: { 'Content-Type': 'application/json', ...auth(token) }, body: body === undefined ? undefined : JSON.stringify(body) })
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]

describe('the super admin list', () => {
	it('lists admins with who they are and when they were added; the created-by-script ones read as launch team', async () => {
		const a = await admin(t)
		const b = await json(await call('GET', '', a.body.accessToken))
		expect(b).toEqual([{ id: a.body.user.id, name: a.body.user.name, email: a.input.email, you: true, addedAt: null }])
	})
	it('is for super admins only', async () => {
		const s = await signup(t)
		expect((await call('GET', '', s.body.accessToken)).status).toBe(403)
	})
})

describe('adding a super admin', () => {
	it('promotes an existing account with a verified email, and logs it', async () => {
		const a = await admin(t)
		const s = await signup(t)
		await verifyEmail(t, s.input.email)
		const res = await call('POST', '', a.body.accessToken, { email: s.input.email.toUpperCase() })
		expect(res.status).toBe(201)
		expect((await rows(`select is_super_admin, admin_added_by from users where id = ?`, [s.body.user.id]))[0]).toMatchObject({ is_super_admin: 1, admin_added_by: a.body.user.id })
		const list = await json(await call('GET', '', a.body.accessToken))
		expect(list).toHaveLength(2)
		expect(list.find((x: any) => x.id === s.body.user.id).addedAt).toBeTruthy()
		expect(await rows(`select actor_id, target from audit_log where action = 'admin.add'`)).toEqual([{ actor_id: a.body.user.id, target: s.body.user.id }])
		// access is immediate
		expect((await call('GET', '', s.body.accessToken)).status).toBe(200)
	})
	it('an unknown email is 404, an unverified email is 409, someone already an admin is 409, a bad body is 422', async () => {
		const a = await admin(t)
		const s = await signup(t)
		expect((await call('POST', '', a.body.accessToken, { email: 'nobody@demo.example' })).status).toBe(404)
		expect((await call('POST', '', a.body.accessToken, { email: s.input.email })).status).toBe(409)
		expect((await call('POST', '', a.body.accessToken, { email: a.input.email })).status).toBe(409)
		expect((await call('POST', '', a.body.accessToken, { email: 'nope' })).status).toBe(422)
	})
	it('a suspended account cannot be made an admin', async () => {
		const a = await admin(t)
		const s = await signup(t)
		await verifyEmail(t, s.input.email)
		await t.pool.query(`update users set status = 'suspended' where id = ?`, [s.body.user.id])
		expect((await call('POST', '', a.body.accessToken, { email: s.input.email })).status).toBe(409)
	})
	it('only a super admin can add one', async () => {
		const s = await signup(t)
		expect((await call('POST', '', s.body.accessToken, { email: s.input.email })).status).toBe(403)
	})
})

describe('removing a super admin', () => {
	it('demotes them at once and logs it', async () => {
		const a = await admin(t)
		const b = await admin(t)
		const res = await call('DELETE', `/${b.body.user.id}`, a.body.accessToken)
		expect(res.status).toBe(200)
		expect((await rows(`select is_super_admin from users where id = ?`, [b.body.user.id]))[0].is_super_admin).toBe(0)
		expect((await call('GET', '', b.body.accessToken)).status).toBe(403)
		expect(await rows(`select target from audit_log where action = 'admin.remove'`)).toEqual([{ target: b.body.user.id }])
	})
	it('you cannot remove yourself, the last admin, or someone who is not an admin', async () => {
		const a = await admin(t)
		expect((await call('DELETE', `/${a.body.user.id}`, a.body.accessToken)).status).toBe(409)
		const s = await signup(t)
		expect((await call('DELETE', `/${s.body.user.id}`, a.body.accessToken)).status).toBe(404)
		expect((await call('DELETE', '/nope', a.body.accessToken)).status).toBe(404)
	})
})
