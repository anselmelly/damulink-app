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
	it('stops the server from starting in production unless it is allowed on purpose', () => {
		expect(() => loadEnv({ ...base, OTP_FIXED_CODE: '123456', NODE_ENV: 'production' })).toThrow(/OTP_FIXED_ALLOW_SERVER/)
		expect(() => loadEnv({ ...base, OTP_FIXED_CODE: '123456', APP_URL: 'https://dl.anselmelly.com' })).toThrow(/OTP_FIXED_ALLOW_SERVER/)
		expect(() => loadEnv({ ...base, OTP_FIXED_CODE: '123456', NODE_ENV: 'production', OTP_FIXED_ALLOW_SERVER: 'true' })).toThrow(/OTP_FIXED_ALLOW_SERVER/)
	})
	it('on a server, once allowed on purpose, it works for every phone', () => {
		const c = loadEnv({ ...base, OTP_FIXED_CODE: '234875', NODE_ENV: 'production', APP_URL: 'https://dl.anselmelly.com', OTP_FIXED_ALLOW_SERVER: 'yes' }).config
		expect(c.fixedOtp).toBe('234875')
		expect(c.fixedOtpPhones).toBeUndefined()
	})
	it('a list of phones narrows it (any phone format)', () => {
		const c = loadEnv({ ...base, OTP_FIXED_CODE: '123456', NODE_ENV: 'production', APP_URL: 'https://dl.anselmelly.com', OTP_FIXED_ALLOW_SERVER: 'yes', OTP_FIXED_PHONES: '0712 345 678, +254 722 000 111' }).config
		expect(c.fixedOtp).toBe('123456')
		expect(c.fixedOtpPhones).toEqual(['+254712345678', '+254722000111'])
	})
	it('a phone in the list that is not a Kenyan number stops the server', () => {
		expect(() => loadEnv({ ...base, OTP_FIXED_CODE: '123456', OTP_FIXED_PHONES: '12345' })).toThrow(/OTP_FIXED_PHONES/)
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

describe('with a fixed code for listed phones only', () => {
	const listed = '+254712999001'
	const t = makeTestApp({ fixedOtp: '123456', fixedOtpPhones: [listed] })
	beforeEach(async () => {
		await resetAccounts(t)
		t.sms.sent.length = 0
	})
	afterAll(() => t.pool.end())

	it('a listed number gets the fixed code', async () => {
		await signup(t, { phone: '0712999001' })
		expect(smsCode(t)).toBe('123456')
	})
	it('every other number gets a real random code', async () => {
		const { body } = await signup(t, { phone: '0712999002' })
		expect(smsCode(t)).not.toBe('123456')
		expect((await post(t, '/api/auth/phone/verify', { code: '123456' }, auth(body.accessToken))).status).toBe(400)
	})
})
