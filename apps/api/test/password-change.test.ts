import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, login, makeTestApp, post, resetAccounts, signup } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const change = (token: string | null, currentPassword: string, newPassword: string) => post(t, '/api/me/password', { currentPassword, newPassword }, token ? auth(token) : {})

describe('POST /api/me/password', () => {
	it('needs a session', async () => {
		expect((await change(null, 'x', 'y'.repeat(9))).status).toBe(401)
	})
	it('a wrong current password is 403', async () => {
		const { body } = await signup(t)
		expect((await change(body.accessToken, 'not-my-password', 'a-brand-new-pass')).status).toBe(403)
	})
	it('a weak new password is 422', async () => {
		const { body, input } = await signup(t)
		expect((await change(body.accessToken, input.password, 'short')).status).toBe(422)
	})
	it('success returns new tokens, kills the old ones, and the new password works', async () => {
		const { body, input } = await signup(t)
		const res = await change(body.accessToken, input.password, 'a-brand-new-pass')
		expect(res.status).toBe(200)
		const next = await json(res)
		expect((await get(t, '/api/me', auth(body.accessToken))).status).toBe(401)
		expect((await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken })).status).toBe(401)
		expect((await get(t, '/api/me', auth(next.accessToken))).status).toBe(200)
		expect((await login(t, input.email, 'a-brand-new-pass')).status).toBe(200)
		expect((await login(t, input.email, input.password)).status).toBe(401)
	})
})
