import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { setSetting } from '@damu/db'
import { auth, get, json, makeTestApp, resetAccounts, setDonorFacts, signup } from './helpers'

const t = makeTestApp() // the clock is 2026-11-14
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const me = async (token: string) => json(await get(t, '/api/me', auth(token)))

describe('donor status on /api/me', () => {
	it('a new donor is Registered, with no blood type, and likely eligible', async () => {
		const { body } = await signup(t)
		expect(await me(body.accessToken)).toMatchObject({ donorStatus: 'registered', bloodType: null, eligibility: { status: 'eligible' } })
	})
	it('a recorded blood type makes the donor Verified', async () => {
		const { body, input } = await signup(t)
		await setDonorFacts(t, input.email, { blood_type: 'O+' })
		expect(await me(body.accessToken)).toMatchObject({ donorStatus: 'verified', bloodType: 'O+' })
	})
	it('a recent donation shows the date they can give again (women wait 4 months)', async () => {
		const { body, input } = await signup(t, { sex: 'female' })
		await setDonorFacts(t, input.email, { blood_type: 'A+', last_donation_on: '2026-09-02' })
		expect((await me(body.accessToken)).eligibility).toMatchObject({ status: 'waiting', eligibleOn: '2027-01-02' })
	})
	it('men wait 3 months', async () => {
		const { body, input } = await signup(t, { sex: 'male' })
		await setDonorFacts(t, input.email, { blood_type: 'A+', last_donation_on: '2026-09-02' })
		expect((await me(body.accessToken)).eligibility).toMatchObject({ status: 'waiting', eligibleOn: '2026-12-02' })
	})
	it('under 18: too young, with the date they turn 18', async () => {
		const { body } = await signup(t, { dateOfBirth: '2010-03-05' })
		expect((await me(body.accessToken)).eligibility).toMatchObject({ status: 'too_young', eligibleOn: '2028-03-05' })
	})
	it('a weight under the limit is only an advisory', async () => {
		const { body, input } = await signup(t)
		await setDonorFacts(t, input.email, { blood_type: 'B+', weight_kg: 47.5 })
		expect((await me(body.accessToken)).eligibility).toMatchObject({ status: 'eligible', weightAdvisory: true })
	})
	it('reads the waiting period from the settings table', async () => {
		await setSetting(t.db, 'eligibility', { minAge: 18, maxAge: 65, minWeightKg: 50, waitingMonthsMale: 3, waitingMonthsFemale: 6 }, t.clock.now())
		const { body, input } = await signup(t, { sex: 'female' })
		await setDonorFacts(t, input.email, { blood_type: 'A+', last_donation_on: '2026-09-02' })
		expect((await me(body.accessToken)).eligibility.eligibleOn).toBe('2027-03-02')
	})
	it('a damaged settings value falls back to the defaults', async () => {
		await setSetting(t.db, 'eligibility', { waitingMonthsFemale: 'soon' }, t.clock.now())
		const { body, input } = await signup(t, { sex: 'female' })
		await setDonorFacts(t, input.email, { blood_type: 'A+', last_donation_on: '2026-09-02' })
		expect((await me(body.accessToken)).eligibility.eligibleOn).toBe('2027-01-02')
	})
})
