import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applicant, json, login, makeTestApp, post, resetAccounts, signup, verifiedFacility } from './helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const loginWith = (email: string, password: string, facilityCode?: string) => post(t, '/api/auth/login', { email, password, facilityCode })

describe('logging in with a facility code', () => {
	it('without a code you open your donor account: facility is null', async () => {
		const { owner } = await verifiedFacility(t)
		expect((await json(await login(t, owner.input.email, owner.input.password))).facility).toBeNull()
	})
	it('with your facility code you open that facility', async () => {
		const { owner, id, code } = await verifiedFacility(t, { name: 'Lakeview Hospital' })
		const res = await loginWith(owner.input.email, owner.input.password, code)
		expect(res.status).toBe(200)
		expect((await json(res)).facility).toEqual({ id, name: 'Lakeview Hospital', status: 'verified', role: 'admin' })
	})
	it('forgives case and spaces in the code', async () => {
		const { owner, code } = await verifiedFacility(t)
		expect((await loginWith(owner.input.email, owner.input.password, `  ${code.toLowerCase()} `)).status).toBe(200)
	})
	it('a wrong code, a code from a facility that is not yours, and a wrong password all give the same answer (401)', async () => {
		const { owner, code } = await verifiedFacility(t)
		const stranger = await signup(t)
		const wrongPassword = await loginWith(owner.input.email, 'not-the-password', code)
		const unknownCode = await loginWith(owner.input.email, owner.input.password, 'FC-AAAA-AA')
		const notMine = await loginWith(stranger.input.email, stranger.input.password, code)
		for (const r of [wrongPassword, unknownCode, notMine]) expect(r.status).toBe(401)
		const bodies = [await json(wrongPassword), await json(unknownCode), await json(notMine)]
		expect(bodies[1]).toEqual(bodies[0])
		expect(bodies[2]).toEqual(bodies[0])
	})
	it('a malformed code is 401, not an error page', async () => {
		const { owner } = await verifiedFacility(t)
		expect((await loginWith(owner.input.email, owner.input.password, 'banana')).status).toBe(401)
	})
	it('the admin of a facility that is still pending can open it, to see its status', async () => {
		const a = await applicant(t)
		const res = await loginWith(a.input.email, a.input.password, a.facility.facilityCode)
		expect(res.status).toBe(200)
		expect((await json(res)).facility).toMatchObject({ status: 'pending', role: 'admin' })
	})
	it('failed tries with a code count towards the same lock as any failed login', async () => {
		const { owner, code } = await verifiedFacility(t)
		for (let i = 0; i < 5; i++) await loginWith(owner.input.email, 'wrong-password', code)
		expect((await loginWith(owner.input.email, owner.input.password, code)).status).toBe(429)
	})
})
