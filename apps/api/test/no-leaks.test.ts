import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth, emailToken, json, makeTestApp, post, resetAccounts, signup, smsCode } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('secrets stay out of responses and logs', () => {
	it('no response or log line contains a password, a link token or a phone code', async () => {
		const logs: string[] = []
		for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a.join(' ')))
		const bodies: string[] = []
		const { res, body, input } = await signup(t)
		bodies.push(JSON.stringify(body))
		const verifyTok = emailToken(t)
		const code = smsCode(t)
		bodies.push(await (await post(t, '/api/auth/forgot-password', { email: input.email })).text())
		const resetTok = emailToken(t)
		t.clock.advance(61 * 1000)
		bodies.push(await (await post(t, '/api/auth/phone/send', {}, auth(body.accessToken))).text())
		bodies.push(await (await post(t, '/api/auth/phone/verify', { code: '000000' }, auth(body.accessToken))).text())
		bodies.push(await (await post(t, '/api/auth/verify-email', { token: 'x'.repeat(43) })).text())
		bodies.push(await (await post(t, '/api/auth/login', { email: input.email, password: 'wrong-password' })).text())
		expect(res.status).toBe(201)
		for (const secret of [input.password, verifyTok, resetTok, code]) {
			for (const b of bodies) expect(b).not.toContain(secret)
			for (const l of logs) expect(l).not.toContain(secret)
		}
		expect(await json(new Response(bodies[1]))).toEqual({ ok: true })
		vi.restoreAllMocks()
	})
})
