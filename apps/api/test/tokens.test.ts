import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, post, resetAccounts, signup, get, auth, login } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('refresh tokens', () => {
	it('refresh returns a new pair; the old refresh token is dead afterwards', async () => {
		const { body } = await signup(t)
		const res = await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken })
		expect(res.status).toBe(200)
		const next = await json(res)
		expect(next.refreshToken).not.toBe(body.refreshToken)
		expect((await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken })).status).toBe(401)
	})
	it('replaying a used refresh token kills the whole family, including the new token', async () => {
		const { body } = await signup(t)
		const next = await json(await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken }))
		await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken }) // replay
		expect((await post(t, '/api/auth/refresh', { refreshToken: next.refreshToken })).status).toBe(401)
	})
	it('an expired refresh token is 401 (30 days)', async () => {
		const { body } = await signup(t)
		t.clock.advance(31 * 24 * 3600 * 1000)
		expect((await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken })).status).toBe(401)
	})
	it('an unknown refresh token is 401', async () => {
		expect((await post(t, '/api/auth/refresh', { refreshToken: 'x'.repeat(43) })).status).toBe(401)
	})
	it('logout kills the family', async () => {
		const { body } = await signup(t)
		expect((await post(t, '/api/auth/logout', { refreshToken: body.refreshToken })).status).toBe(204)
		expect((await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken })).status).toBe(401)
	})
	it('logout-all kills every session and every access token (token_revoked)', async () => {
		const a = await signup(t)
		const b = await json(await login(t, a.input.email, a.input.password))
		expect((await post(t, '/api/auth/logout-all', {}, auth(a.body.accessToken))).status).toBe(204)
		const res = await get(t, '/api/me', auth(b.accessToken))
		expect(res.status).toBe(401)
		expect((await json(res)).error.code).toBe('token_revoked')
		expect((await post(t, '/api/auth/refresh', { refreshToken: b.refreshToken })).status).toBe(401)
	})
	it('the access token expires after 15 minutes (clock)', async () => {
		const { body } = await signup(t)
		expect((await get(t, '/api/me', auth(body.accessToken))).status).toBe(200)
		t.clock.advance(16 * 60 * 1000)
		const res = await get(t, '/api/me', auth(body.accessToken))
		expect(res.status).toBe(401)
		expect((await json(res)).error.code).toBe('token_expired')
	})
	it('the refresh token is stored hashed, never raw', async () => {
		const { body } = await signup(t)
		const [row] = (await t.pool.query('select token_hash from refresh_tokens')) as any
		expect(row[0].token_hash).not.toContain(body.refreshToken)
		expect(row[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
	})
})
