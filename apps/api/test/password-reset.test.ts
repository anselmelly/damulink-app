import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, emailToken, get, json, login, makeTestApp, post, resetAccounts, signup } from './helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const forgot = (email: string) => post(t, '/api/auth/forgot-password', { email })
const reset = (token: string, password: string) => post(t, '/api/auth/reset-password', { token, password })

describe('forgot and reset password', () => {
	it('answers 200 for a known and an unknown email alike, and only mails the known one', async () => {
		const { input } = await signup(t)
		t.mail.sent.length = 0
		const a = await forgot(input.email)
		const b = await forgot('nobody@example.com')
		expect(a.status).toBe(200)
		expect(b.status).toBe(200)
		expect(await json(a)).toEqual(await json(b))
		expect(t.mail.sent).toHaveLength(1)
		expect(t.mail.sent[0].to).toBe(input.email)
		expect(t.mail.sent[0].text).toContain('http://localhost:5173/reset-password?token=')
	})
	it('the link sets a new password; the new one works and the old one does not', async () => {
		const { input } = await signup(t)
		await forgot(input.email)
		expect((await reset(emailToken(t), 'a-brand-new-pass')).status).toBe(204)
		expect((await login(t, input.email, 'a-brand-new-pass')).status).toBe(200)
		expect((await login(t, input.email, input.password)).status).toBe(401)
	})
	it('a link works once only', async () => {
		const { input } = await signup(t)
		await forgot(input.email)
		const token = emailToken(t)
		await reset(token, 'a-brand-new-pass')
		const again = await reset(token, 'another-new-pass')
		expect(again.status).toBe(400)
		expect((await json(again)).error.code).toBe('invalid_token')
	})
	it('a link expires after 60 minutes', async () => {
		const { input } = await signup(t)
		await forgot(input.email)
		t.clock.advance(61 * 60 * 1000)
		const res = await reset(emailToken(t), 'a-brand-new-pass')
		expect(res.status).toBe(400)
		expect((await json(res)).error.code).toBe('token_expired')
	})
	it('a reset kills every live access token and refresh token', async () => {
		const { body, input } = await signup(t)
		await forgot(input.email)
		await reset(emailToken(t), 'a-brand-new-pass')
		expect((await get(t, '/api/me', auth(body.accessToken))).status).toBe(401)
		expect((await post(t, '/api/auth/refresh', { refreshToken: body.refreshToken })).status).toBe(401)
	})
	it('a weak new password is 422 and the link stays usable', async () => {
		const { input } = await signup(t)
		await forgot(input.email)
		const token = emailToken(t)
		expect((await reset(token, 'short')).status).toBe(422)
		expect((await reset(token, 'a-brand-new-pass')).status).toBe(204)
	})
	it('asking again cancels the earlier link', async () => {
		const { input } = await signup(t)
		await forgot(input.email)
		const first = emailToken(t)
		await forgot(input.email)
		expect((await reset(first, 'a-brand-new-pass')).status).toBe(400)
		expect((await reset(emailToken(t), 'a-brand-new-pass')).status).toBe(204)
	})
	it('a suspended account gets no reset mail, and the answer looks the same', async () => {
		const { input } = await signup(t)
		await t.pool.query("update users set status = 'suspended'")
		t.mail.sent.length = 0
		expect((await forgot(input.email)).status).toBe(200)
		expect(t.mail.sent).toHaveLength(0)
	})
})
