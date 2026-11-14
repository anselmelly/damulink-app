import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addFacility, auth, emailToken, get, json, login, makeTestApp, post, resetAccounts, signup } from './helpers'

const t = makeTestApp() // clock 2026-11-14
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const patch = (token: string, body: unknown) => t.app.request('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) })
const put = (path: string, token: string, body: unknown) => t.app.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) })
const del = (token: string, body: unknown) => t.app.request('/api/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) })

describe('PATCH /api/me (profile details)', () => {
	it('needs a session', async () => {
		expect((await t.app.request('/api/me', { method: 'PATCH', body: '{}' })).status).toBe(401)
	})
	it('changes the name, sex and date of birth', async () => {
		const { body } = await signup(t, { sex: 'female' })
		const res = await patch(body.accessToken, { name: 'Amina W. Wanjiru', sex: 'male', dateOfBirth: '1990-01-02' })
		expect(res.status).toBe(200)
		expect(await json(res)).toMatchObject({ name: 'Amina W. Wanjiru' })
	})
	it('a new email is unverified again, gets a verification link, and a taken one is 409', async () => {
		const a = await signup(t)
		const b = await signup(t)
		await post(t, '/api/auth/verify-email', { token: emailToken(t, a.input.email) })
		t.mail.sent.length = 0
		expect((await patch(a.body.accessToken, { email: b.input.email })).status).toBe(409)
		const res = await patch(a.body.accessToken, { email: 'new.address@example.com' })
		expect(res.status).toBe(200)
		expect(await json(res)).toMatchObject({ email: 'new.address@example.com', emailVerified: false })
		expect(t.mail.sent).toHaveLength(1)
		expect(t.mail.sent[0].to).toBe('new.address@example.com')
	})
	it('saving the same email changes nothing and sends nothing', async () => {
		const { body, input } = await signup(t)
		t.mail.sent.length = 0
		const res = await patch(body.accessToken, { email: input.email.toUpperCase() })
		expect(res.status).toBe(200)
		expect(t.mail.sent).toHaveLength(0)
	})
	it('a date of birth in the future or not real is 422', async () => {
		const { body } = await signup(t)
		expect((await patch(body.accessToken, { dateOfBirth: '2030-01-01' })).status).toBe(422)
		expect((await patch(body.accessToken, { dateOfBirth: '1990-02-31' })).status).toBe(422)
	})
	it('turning from adult to under 18 removes the donor code, and the other way gives one', async () => {
		const { body } = await signup(t, { dateOfBirth: '1990-01-01' })
		const young = await json(await patch(body.accessToken, { dateOfBirth: '2012-01-01' }))
		expect(young).toMatchObject({ donorCode: null, canDonate: false })
		const adult = await json(await patch(body.accessToken, { dateOfBirth: '1990-01-01' }))
		expect(adult.donorCode).toMatch(/^DL-/)
		expect(adult.canDonate).toBe(true)
	})
})

describe('PUT /api/me/facilities', () => {
	it('sets the home facility and extra ones; /me shows them in that order', async () => {
		const a = await addFacility(t, 'Rift County Hospital')
		const b = await addFacility(t, 'Lakeview Hospital', 'Kisumu')
		const c = await addFacility(t, 'Eastlands Hospital', 'Nairobi')
		const { body } = await signup(t)
		const res = await put('/api/me/facilities', body.accessToken, { homeFacilityId: b, extraFacilityIds: [a, c] })
		expect(res.status).toBe(200)
		expect((await json(res)).facilities.map((f: any) => f.id)).toEqual([b, a, c])
	})
	it('replaces the earlier choice', async () => {
		const a = await addFacility(t, 'Rift County Hospital')
		const b = await addFacility(t, 'Lakeview Hospital', 'Kisumu')
		const { body } = await signup(t, { homeFacilityId: a })
		await put('/api/me/facilities', body.accessToken, { homeFacilityId: b, extraFacilityIds: [] })
		expect((await json(await get(t, '/api/me', auth(body.accessToken)))).facilities.map((f: any) => f.id)).toEqual([b])
	})
	it('refuses an unverified facility, the home facility repeated as extra, and more than 5 extras (422)', async () => {
		const a = await addFacility(t, 'Rift County Hospital')
		const pending = await addFacility(t, 'Pending Clinic', 'Nyeri', 'pending')
		const { body } = await signup(t)
		expect((await put('/api/me/facilities', body.accessToken, { homeFacilityId: pending, extraFacilityIds: [] })).status).toBe(422)
		expect((await put('/api/me/facilities', body.accessToken, { homeFacilityId: a, extraFacilityIds: [a] })).status).toBe(422)
		const many = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => addFacility(t, `Clinic ${i}`)))
		expect((await put('/api/me/facilities', body.accessToken, { homeFacilityId: a, extraFacilityIds: many })).status).toBe(422)
	})
	it('can clear the home facility', async () => {
		const a = await addFacility(t)
		const { body } = await signup(t, { homeFacilityId: a })
		const res = await put('/api/me/facilities', body.accessToken, { homeFacilityId: null, extraFacilityIds: [] })
		expect((await json(res)).facilities).toEqual([])
	})
})

describe('POST /api/me/facility-requests (my facility is not listed)', () => {
	const ask = (token: string, body: unknown) => post(t, '/api/me/facility-requests', body, auth(token))
	it('records the name, town and county (201)', async () => {
		const { body } = await signup(t)
		const res = await ask(body.accessToken, { name: 'Riverside Dispensary', town: 'Thika', county: 'Kiambu' })
		expect(res.status).toBe(201)
		const [rows] = (await t.pool.query('select name, town, county from facility_requests')) as any
		expect(rows).toEqual([{ name: 'Riverside Dispensary', town: 'Thika', county: 'Kiambu' }])
	})
	it('needs name and town (422) and a session (401)', async () => {
		const { body } = await signup(t)
		expect((await ask(body.accessToken, { name: 'X' })).status).toBe(422)
		expect((await post(t, '/api/me/facility-requests', { name: 'Riverside', town: 'Thika' })).status).toBe(401)
	})
	it('at most 5 a day', async () => {
		const { body } = await signup(t)
		for (let i = 0; i < 5; i++) expect((await ask(body.accessToken, { name: `Clinic ${i}`, town: 'Thika' })).status).toBe(201)
		expect((await ask(body.accessToken, { name: 'One more', town: 'Thika' })).status).toBe(429)
	})
})

describe('DELETE /api/me', () => {
	it('needs the password: a wrong one is 403 and nothing is deleted', async () => {
		const { body, input } = await signup(t)
		expect((await del(body.accessToken, { password: 'not-my-password' })).status).toBe(403)
		expect((await login(t, input.email, input.password)).status).toBe(200)
	})
	it('removes the account and everything of the donor, and every session ends', async () => {
		const facility = await addFacility(t)
		const { body, input } = await signup(t, { homeFacilityId: facility })
		await t.pool.query("update users set phone_verified_at = now()")
		await post(t, '/api/me/donation-requests', { kind: 'test', facilityId: facility, days: ['wed'], timeOfDay: 'any' }, auth(body.accessToken))
		expect((await del(body.accessToken, { password: input.password })).status).toBe(204)
		for (const table of ['users', 'refresh_tokens', 'donation_requests', 'auth_tokens', 'phone_otps', 'donor_prefs', 'user_extra_facilities']) {
			const [rows] = (await t.pool.query(`select count(*) as n from \`${table}\``)) as any
			expect(Number(rows[0].n), table).toBe(0)
		}
		expect((await get(t, '/api/me', auth(body.accessToken))).status).toBe(401)
		expect((await login(t, input.email, input.password)).status).toBe(401)
	})
	it('the audit log keeps a line with the id only, no name or email', async () => {
		const { body, input } = await signup(t)
		await del(body.accessToken, { password: input.password })
		const [rows] = (await t.pool.query('select action, target, detail from audit_log order by id desc limit 1')) as any
		expect(rows[0].action).toBe('account_deleted')
		expect(JSON.stringify(rows[0])).not.toContain(input.email)
		expect(JSON.stringify(rows[0])).not.toContain('Amina')
	})
})
