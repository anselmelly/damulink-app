import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env'
import { auth, makeTestApp, post, resetAccounts, signup, smsCode } from './helpers'

const base = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'd', JWT_SECRET: 'x'.repeat(40) }

describe('OTP_FIXED_CODE (a development aid, refused anywhere else)', () => {
	it('is off by default', () => {
		expect(loadEnv(base).config.fixedOtp).toBeUndefined()
	})
	it('is accepted for local development', () => {
		expect(loadEnv({ ...base, OTP_FIXED_CODE: '123456' }).config.fixedOtp).toBe('123456')
		expect(loadEnv({ ...base, OTP_FIXED_CODE: '123456', APP_URL: 'http://127.0.0.1:5173' }).config.fixedOtp).toBe('123456')
	})
	it('stops the server from starting in production', () => {
		expect(() => loadEnv({ ...base, OTP_FIXED_CODE: '123456', NODE_ENV: 'production' })).toThrow(/OTP_FIXED_CODE/)
	})
	it('stops the server from starting when the app is not on this machine', () => {
		expect(() => loadEnv({ ...base, OTP_FIXED_CODE: '123456', APP_URL: 'https://dl.anselmelly.com' })).toThrow(/OTP_FIXED_CODE/)
	})
	it('must be six digits', () => {
		expect(() => loadEnv({ ...base, OTP_FIXED_CODE: '12ab' })).toThrow(/OTP_FIXED_CODE/)
	})
})

describe('with a fixed code', () => {
	const t = makeTestApp({ fixedOtp: '123456' })
	beforeEach(async () => {
		await resetAccounts(t)
		t.sms.sent.length = 0
	})
	afterAll(() => t.pool.end())

	it('every text carries 123456 and it verifies the phone', async () => {
		const { body } = await signup(t)
		expect(smsCode(t)).toBe('123456')
		expect((await post(t, '/api/auth/phone/verify', { code: '123456' }, auth(body.accessToken))).status).toBe(200)
	})
	it('a different code is still wrong', async () => {
		const { body } = await signup(t)
		expect((await post(t, '/api/auth/phone/verify', { code: '654321' }, auth(body.accessToken))).status).toBe(400)
	})
})
