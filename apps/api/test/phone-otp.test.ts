import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, login, makeTestApp, post, resetAccounts, signup, smsCode } from './helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())
const MIN = 60 * 1000
const verify = (token: string, code: string) => post(t, '/api/auth/phone/verify', { code }, auth(token))
const send = (token: string, body: unknown = {}) => post(t, '/api/auth/phone/send', body, auth(token))
const phoneOk = async (token: string) => (await json(await get(t, '/api/me', auth(token)))).phoneVerified

describe('phone codes', () => {
	it('signup sends exactly one text with a six-digit code, to the number given', async () => {
		await signup(t, { phone: '0712345678' })
		expect(t.sms.sent).toHaveLength(1)
		expect(t.sms.sent[0].to).toBe('+254712345678')
		expect(t.sms.sent[0].text).toMatch(/\b\d{6}\b/)
		expect(t.sms.sent[0].text.length).toBeLessThanOrEqual(160)
	})
	it('the code verifies the phone once', async () => {
		const { body } = await signup(t)
		const code = smsCode(t)
		expect((await verify(body.accessToken, code)).status).toBe(200)
		expect(await phoneOk(body.accessToken)).toBe(true)
		expect((await verify(body.accessToken, code)).status).toBe(400) // already used
	})
	it('the code is stored hashed, never in plain text', async () => {
		await signup(t)
		const [rows] = (await t.pool.query('select code_hash from phone_otps')) as any
		expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/)
		expect(rows[0].code_hash).not.toContain(smsCode(t))
	})
	it('a wrong code is 400 and counts; the right code still works afterwards', async () => {
		const { body } = await signup(t)
		const code = smsCode(t)
		const wrong = code === '000000' ? '111111' : '000000'
		const res = await verify(body.accessToken, wrong)
		expect(res.status).toBe(400)
		expect((await json(res)).error.code).toBe('wrong_code')
		expect((await verify(body.accessToken, code)).status).toBe(200)
	})
	it('five wrong tries lock the code for 15 minutes, even for the right code', async () => {
		const { body, input } = await signup(t)
		const code = smsCode(t)
		const wrong = code === '000000' ? '111111' : '000000'
		for (let i = 0; i < 5; i++) await verify(body.accessToken, wrong)
		const locked = await verify(body.accessToken, code)
		expect(locked.status).toBe(429)
		expect((await json(locked)).error.code).toBe('locked')
		t.clock.advance(16 * MIN)
		// the lock is over, but the code itself expired after 10 minutes, so a new one is needed
		const fresh = (await json(await login(t, input.email, input.password))).accessToken
		expect((await verify(fresh, code)).status).toBe(400)
	})
	it('a code expires after 10 minutes, told apart from a wrong one', async () => {
		const { body } = await signup(t)
		t.clock.advance(11 * MIN)
		const res = await verify(body.accessToken, smsCode(t))
		expect(res.status).toBe(400)
		expect((await json(res)).error.code).toBe('code_expired')
	})
	it('resend waits 60 seconds, then a new code replaces the old one', async () => {
		const { body } = await signup(t)
		const first = smsCode(t)
		expect((await send(body.accessToken)).status).toBe(429)
		t.clock.advance(61 * 1000)
		expect((await send(body.accessToken)).status).toBe(204)
		const second = smsCode(t)
		expect(t.sms.sent).toHaveLength(2)
		if (first !== second) expect((await verify(body.accessToken, first)).status).toBe(400)
		expect((await verify(body.accessToken, second)).status).toBe(200)
	})
	it('at most 3 sends an hour: the 4th is 429 even after the 60 second wait', async () => {
		const { body, input } = await signup(t) // send 1
		for (let i = 0; i < 2; i++) {
			t.clock.advance(61 * 1000)
			expect((await send(body.accessToken)).status).toBe(204)
		}
		t.clock.advance(61 * 1000)
		expect((await send(body.accessToken)).status).toBe(429)
		t.clock.advance(60 * MIN)
		const fresh = (await json(await login(t, input.email, input.password))).accessToken // the old access token has expired
		expect((await send(fresh)).status).toBe(204)
	})
	it('changing the number resets verification and texts the new number; a taken number is 409', async () => {
		const a = await signup(t, { phone: '0712000001' })
		const b = await signup(t, { phone: '0712000002' })
		await verify(a.body.accessToken, [...t.sms.sent].reverse().find((m) => m.to === '+254712000001')!.text.match(/\b(\d{6})\b/)![1])
		expect(await phoneOk(a.body.accessToken)).toBe(true)
		t.clock.advance(61 * 1000)
		expect((await send(a.body.accessToken, { phone: '0712000002' })).status).toBe(409)
		expect((await send(a.body.accessToken, { phone: '0712000099' })).status).toBe(204)
		expect(t.sms.sent.at(-1)!.to).toBe('+254712000099')
		expect(await phoneOk(a.body.accessToken)).toBe(false)
		expect(b.body.accessToken).toBeTruthy()
	})
	it('needs a session, and never returns the code in a response', async () => {
		const { body } = await signup(t)
		expect((await post(t, '/api/auth/phone/send', {})).status).toBe(401)
		t.clock.advance(61 * 1000)
		const res = await send(body.accessToken)
		expect(await res.text()).not.toMatch(/\d{6}/)
	})
})
