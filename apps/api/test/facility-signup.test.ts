import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, auth, decideAs, emailToken, get, json, makeTestApp, post, resetAccounts, signup, smsCode, verifyEmail } from './helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

let n = 0
const body = (over: Record<string, unknown> = {}) => ({ name: 'Achieng Ouma', email: `ouma${++n}@lakeview.example`, phone: `0712${String(200000 + n).slice(-6)}`, password: 'correct-horse', facilityName: 'Lakeview Hospital', facilityType: 'hospital', county: 'Kisumu', town: 'Kisumu', ...over })
const register = (b: Record<string, unknown>) => post(t, '/api/auth/register-facility', b)
const put = (path: string, token: string, b: unknown) => t.app.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(b) })
const complete = (over: Record<string, unknown> = {}) => ({ name: 'Lakeview Hospital', type: 'hospital', licenseNumber: 'KSM-H-0102', county: 'Kisumu', town: 'Kisumu', lat: -0.0917, lng: 34.768, phone: '+254572020000', email: 'lab@lakeview.example', role: 'Medical superintendent', authorised: true, ...over })

describe('POST /api/auth/register-facility (someone who is not a donor)', () => {
	it('creates the person, an incomplete facility with a code, and makes them its admin (201)', async () => {
		const res = await register(body())
		expect(res.status).toBe(201)
		const d = await json(res)
		expect(d.accessToken).toBeTruthy()
		expect(d.facility).toMatchObject({ name: 'Lakeview Hospital', status: 'incomplete', role: 'admin' })
		expect(d.facility.facilityCode).toMatch(/^FC-/)
	})
	it('the person has no donor details: no code, cannot donate, eligibility says not a donor', async () => {
		const d = await json(await register(body()))
		const me = await json(await get(t, '/api/me', auth(d.accessToken)))
		expect(me).toMatchObject({ canDonate: false, donorCode: null, sex: null, dateOfBirth: null, eligibility: { status: 'not_a_donor' } })
		expect(me.managedFacilities).toEqual([expect.objectContaining({ name: 'Lakeview Hospital', status: 'incomplete', role: 'admin' })])
	})
	it('sends the email link and the phone code, like any sign-up', async () => {
		const b = body()
		await register(b)
		expect(t.mail.sent.map((m) => m.to)).toEqual([b.email])
		expect(t.sms.sent).toHaveLength(1)
		expect(smsCode(t)).toMatch(/^\d{6}$/)
	})
	it('refuses a taken email or phone (409) and a bad form (422)', async () => {
		const first = body()
		await register(first)
		expect((await register(body({ email: first.email }))).status).toBe(409)
		expect((await register(body({ phone: first.phone }))).status).toBe(409)
		for (const bad of [{ name: 'x' }, { password: 'short' }, { facilityType: 'spaceship' }, { phone: '12345' }, { facilityName: '' }, { county: '' }]) expect((await register(body(bad))).status, JSON.stringify(bad)).toBe(422)
	})
	it('an incomplete facility is not in the queue and not public', async () => {
		const d = await json(await register(body()))
		const ad = await admin(t)
		expect(await json(await get(t, '/api/admin/facilities?view=queue', auth(ad.body.accessToken)))).toEqual([])
		expect(await json(await get(t, '/api/facilities'))).toEqual([])
		expect(d.facility.status).toBe('incomplete')
	})
})

describe('completing the facility profile', () => {
	it('needs a verified email (403), then sends it for review: pending, same code, in the queue', async () => {
		const b = body()
		const d = await json(await register(b))
		const early = await put(`/api/my-facilities/${d.facility.id}`, d.accessToken, complete())
		expect(early.status).toBe(403)
		expect((await json(early)).error.code).toBe('email_not_verified')
		await post(t, '/api/auth/verify-email', { token: emailToken(t, b.email) })
		const res = await put(`/api/my-facilities/${d.facility.id}`, d.accessToken, complete())
		expect(res.status).toBe(200)
		expect(await json(res)).toMatchObject({ status: 'pending', licenseNumber: 'KSM-H-0102', facilityCode: d.facility.facilityCode })
		const ad = await admin(t)
		expect((await json(await get(t, '/api/admin/facilities?view=queue', auth(ad.body.accessToken)))).map((r: any) => r.name)).toEqual(['Lakeview Hospital'])
	})
	it('records a "submitted" event, and the reviewer can then approve it as usual', async () => {
		const b = body()
		const d = await json(await register(b))
		await verifyEmail(t, b.email)
		await put(`/api/my-facilities/${d.facility.id}`, d.accessToken, complete())
		const ad = await admin(t)
		expect((await decideAs(t, ad.body.accessToken, d.facility.id, { action: 'approve' })).status).toBe(200)
		const detail = await json(await get(t, `/api/admin/facilities/${d.facility.id}`, auth(ad.body.accessToken)))
		expect(detail.events.map((e: any) => e.kind)).toEqual(['submitted', 'approve'])
		expect(detail.applicant).toMatchObject({ name: 'Achieng Ouma', roleTitle: 'Medical superintendent' })
	})
	it('a complete facility cannot be "completed" again (409)', async () => {
		const b = body()
		const d = await json(await register(b))
		await verifyEmail(t, b.email)
		await put(`/api/my-facilities/${d.facility.id}`, d.accessToken, complete())
		expect((await put(`/api/my-facilities/${d.facility.id}`, d.accessToken, complete())).status).toBe(409)
	})
})

describe('a facility person who later wants to donate', () => {
	it('adds sex and date of birth in the profile and gets a donor code', async () => {
		const d = await json(await register(body()))
		const res = await t.app.request('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth(d.accessToken) }, body: JSON.stringify({ sex: 'female', dateOfBirth: '1990-01-02' }) })
		expect(await json(res)).toMatchObject({ canDonate: true, sex: 'female', dateOfBirth: '1990-01-02' })
	})
	it('before that they cannot ask to donate or make a donor code (403)', async () => {
		const d = await json(await register(body()))
		expect((await post(t, '/api/me/donor-code/regenerate', {}, auth(d.accessToken))).status).toBe(403)
		expect((await post(t, '/api/me/donation-requests', { kind: 'donate', facilityId: '0'.repeat(26), days: ['mon'], timeOfDay: 'any' }, auth(d.accessToken))).status).toBe(403)
	})
	it('a normal donor sign-up is unchanged', async () => {
		const s = await signup(t)
		expect(await json(await get(t, '/api/me', auth(s.body.accessToken)))).toMatchObject({ canDonate: true, eligibility: { status: 'eligible' } })
	})
})
