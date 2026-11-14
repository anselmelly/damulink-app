import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, emailToken, get, json, makeTestApp, post, resetAccounts, signup } from './helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

describe('email verification', () => {
	it('signup sends exactly one verification email, with a link to the web app', async () => {
		const { input } = await signup(t)
		expect(t.mail.sent).toHaveLength(1)
		expect(t.mail.sent[0].to).toBe(input.email)
		expect(t.mail.sent[0].text).toContain('http://localhost:5173/verify-email?token=')
	})
	it('the link token verifies the email', async () => {
		const { body } = await signup(t)
		const res = await post(t, '/api/auth/verify-email', { token: emailToken(t) })
		expect(res.status).toBe(200)
		expect((await json(await get(t, '/api/me', auth(body.accessToken)))).emailVerified).toBe(true)
	})
	it('the same link cannot be used twice', async () => {
		await signup(t)
		const token = emailToken(t)
		await post(t, '/api/auth/verify-email', { token })
		const again = await post(t, '/api/auth/verify-email', { token })
		expect(again.status).toBe(400)
		expect((await json(again)).error.code).toBe('invalid_token')
	})
	it('an unknown token is invalid; an old one is expired (24 h), and the two are told apart', async () => {
		await signup(t)
		const unknown = await post(t, '/api/auth/verify-email', { token: 'x'.repeat(43) })
		expect((await json(unknown)).error.code).toBe('invalid_token')
		t.clock.advance(25 * 3600 * 1000)
		const old = await post(t, '/api/auth/verify-email', { token: emailToken(t) })
		expect(old.status).toBe(400)
		expect((await json(old)).error.code).toBe('token_expired')
	})
	it('resend needs a session, waits 60 seconds, and replaces the old link', async () => {
		const { body, input } = await signup(t)
		const first = emailToken(t)
		expect((await post(t, '/api/auth/resend-email', {})).status).toBe(401)
		expect((await post(t, '/api/auth/resend-email', {}, auth(body.accessToken))).status).toBe(429)
		t.clock.advance(61 * 1000)
		expect((await post(t, '/api/auth/resend-email', {}, auth(body.accessToken))).status).toBe(204)
		expect(t.mail.sent).toHaveLength(2)
		expect(t.mail.sent[1].to).toBe(input.email)
		expect((await post(t, '/api/auth/verify-email', { token: first })).status).toBe(400) // the old link died
		expect((await post(t, '/api/auth/verify-email', { token: emailToken(t) })).status).toBe(200)
	})
	it('resend when already verified sends nothing and says so (idempotent)', async () => {
		const { body } = await signup(t)
		await post(t, '/api/auth/verify-email', { token: emailToken(t) })
		t.clock.advance(61 * 1000)
		t.mail.sent.length = 0
		const res = await post(t, '/api/auth/resend-email', {}, auth(body.accessToken))
		expect(res.status).toBe(200)
		expect(await json(res)).toEqual({ alreadyVerified: true })
		expect(t.mail.sent).toHaveLength(0)
	})
})
