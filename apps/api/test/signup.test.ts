import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { facilityRequests, userExtraFacilities, users } from '@damu/db'
import { eq } from 'drizzle-orm'
import { addFacility, json, makeTestApp, post, resetAccounts, signup, signupBody } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('POST /api/auth/signup', () => {
	it('creates the account and returns tokens and the user (201)', async () => {
		const { res, body, input } = await signup(t)
		expect(res.status).toBe(201)
		expect(body.accessToken).toBeTruthy()
		expect(body.refreshToken).toBeTruthy()
		expect(body.user).toMatchObject({ name: 'Amina Wanjiru', email: input.email, emailVerified: false, phoneVerified: false, isSuperAdmin: false })
	})
	it('lowercases the email and normalises the phone', async () => {
		await signup(t, { email: 'Amina@Example.COM', phone: '0712 345 678' })
		const [u] = await t.db.select().from(users)
		expect(u.email).toBe('amina@example.com')
		expect(u.phone).toBe('+254712345678')
	})
	it('rejects an invalid phone with 422 and a field message', async () => {
		const { res, body } = await signup(t, { phone: '12345' })
		expect(res.status).toBe(422)
		expect(body.error.fields.phone).toBeTruthy()
	})
	it('rejects a short password with 422', async () => {
		const { res, body } = await signup(t, { password: 'short' })
		expect(res.status).toBe(422)
		expect(body.error.fields.password).toBeTruthy()
	})
	it('refuses a duplicate email, ignoring case (409)', async () => {
		await signup(t, { email: 'a@example.com' })
		const { res } = await signup(t, { email: 'A@example.com' })
		expect(res.status).toBe(409)
	})
	it('refuses a duplicate phone (409)', async () => {
		await signup(t, { phone: '0712345678' })
		const { res } = await signup(t, { phone: '+254712345678' })
		expect(res.status).toBe(409)
	})
	it('an adult gets a donor code and can donate; code matches DL-XXXX-XX', async () => {
		const { body } = await signup(t, { dateOfBirth: '1996-04-12' })
		expect(body.user.donorCode).toMatch(/^DL-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{2}$/)
		expect(body.user.canDonate).toBe(true)
	})
	it('under 18 gets no donor code and cannot donate', async () => {
		const { body } = await signup(t, { dateOfBirth: '2010-01-01' })
		expect(body.user.donorCode).toBeNull()
		expect(body.user.canDonate).toBe(false)
	})
	it('turns 18 today still counts as 18 (uses the clock, not the year)', async () => {
		const { body } = await signup(t, { dateOfBirth: '2008-11-14' }) // clock is 2026-11-14
		expect(body.user.canDonate).toBe(true)
		const day = await signup(t, { dateOfBirth: '2008-11-15' })
		expect(day.body.user.canDonate).toBe(false)
	})
	it('donor codes are unique across many signups', async () => {
		const codes = new Set<string>()
		for (let i = 0; i < 25; i++) codes.add((await signup(t)).body.user.donorCode)
		expect(codes.size).toBe(25)
	})
	it('saves a home facility and extra facilities', async () => {
		const home = await addFacility(t, 'Rift County Hospital')
		const extra = await addFacility(t, 'Lakeview Hospital', 'Kisumu')
		const { res, body } = await signup(t, { homeFacilityId: home, extraFacilityIds: [extra] })
		expect(res.status).toBe(201)
		expect(body.user.facilities.map((f: any) => f.id)).toEqual([home, extra])
		expect(await t.db.select().from(userExtraFacilities).where(eq(userExtraFacilities.facilityId, extra))).toHaveLength(1)
	})
	it('an unknown or unverified home facility is 422', async () => {
		const pending = await addFacility(t, 'Pending Clinic', 'Nyeri', 'pending')
		expect((await signup(t, { homeFacilityId: pending })).res.status).toBe(422)
		expect((await signup(t, { homeFacilityId: '0'.repeat(26) })).res.status).toBe(422)
	})
	it('records an unlisted facility name in the demand list', async () => {
		await signup(t, { unlistedFacilityName: 'Kijabe Mission' })
		const rows = await t.db.select().from(facilityRequests)
		expect(rows).toHaveLength(1)
		expect(rows[0].name).toBe('Kijabe Mission')
	})
	it('stores the sms opt-in choice', async () => {
		await signup(t, { smsOptIn: false })
		expect((await t.db.select().from(users))[0].smsOptIn).toBe(false)
	})
	it('never returns the password or its hash', async () => {
		const { body, input } = await signup(t)
		const text = JSON.stringify(body)
		expect(text).not.toContain(input.password)
		expect(text).not.toContain('pbkdf2')
		expect(text).not.toContain('passwordHash')
	})
	it('a failed signup creates nothing', async () => {
		await signup(t, { phone: '12345' })
		expect(await t.db.select().from(users)).toHaveLength(0)
		const res = await post(t, '/api/auth/signup', { ...signupBody(), dateOfBirth: 'yesterday' })
		expect(res.status).toBe(422)
		expect(await json(res)).toHaveProperty('error.fields.dateOfBirth')
	})
})
