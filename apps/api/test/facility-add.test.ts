import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applicant, auth, facilityBody, get, json, makeTestApp, post, resetAccounts, signup, verifyEmail } from './helpers'
import { admin } from './helpers'

const t = makeTestApp() // clock 2026-11-14T08:00Z
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const send = (token: string, body: unknown) => post(t, '/api/facilities', body, auth(token))
const put = (path: string, token: string, body: unknown) => t.app.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) })

describe('POST /api/facilities (add a facility)', () => {
	it('needs a session', async () => {
		expect((await post(t, '/api/facilities', facilityBody())).status).toBe(401)
	})
	it('needs a verified email (403)', async () => {
		const { body } = await signup(t)
		const res = await send(body.accessToken, facilityBody())
		expect(res.status).toBe(403)
		expect((await json(res)).error.code).toBe('email_not_verified')
	})
	it('creates a pending facility with a code, and the applicant becomes its admin (201)', async () => {
		const a = await applicant(t, { name: 'Lakeview Hospital', licenseNumber: 'KSM-H-0102' })
		expect(a.res.status).toBe(201)
		expect(a.facility).toMatchObject({ name: 'Lakeview Hospital', status: 'pending', role: 'admin', licenseNumber: 'KSM-H-0102', town: 'Kisumu' })
		expect(a.facility.facilityCode).toMatch(/^FC-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{2}$/)
		expect(a.facility.submittedAt).toBe('2026-11-14T08:00:00.000Z')
	})
	it('every facility gets its own code', async () => {
		const codes = new Set<string>()
		const s = await signup(t)
		await verifyEmail(t, s.input.email)
		for (let i = 0; i < 3; i++) codes.add((await json(await send(s.body.accessToken, facilityBody()))).facilityCode)
		expect(codes.size).toBe(3)
	})
	it('checks the form (422): name, type, coordinates, phone, authorisation', async () => {
		const s = await signup(t)
		await verifyEmail(t, s.input.email)
		for (const bad of [{ name: 'x' }, { type: 'spaceship' }, { lat: 91 }, { lng: -181 }, { phone: 'call me' }, { email: 'nope' }, { authorised: false }, { licenseNumber: '' }]) {
			const res = await send(s.body.accessToken, facilityBody(bad))
			expect(res.status, JSON.stringify(bad)).toBe(422)
		}
	})
	it('normalises the facility phone to +254... form', async () => {
		const s = await signup(t)
		await verifyEmail(t, s.input.email)
		await send(s.body.accessToken, facilityBody({ phone: '057 202 0000' }))
		const [rows] = (await t.pool.query('select phone from facilities')) as any
		expect(rows[0].phone).toBe('+254572020000')
	})
	it('at most 3 a day (429)', async () => {
		const s = await signup(t)
		await verifyEmail(t, s.input.email)
		for (let i = 0; i < 3; i++) expect((await send(s.body.accessToken, facilityBody())).status).toBe(201)
		expect((await send(s.body.accessToken, facilityBody())).status).toBe(429)
	})
	it('the same license number is allowed, so a reviewer can look at both', async () => {
		await applicant(t, { licenseNumber: 'MSA-C-0877' })
		expect((await applicant(t, { licenseNumber: 'MSA-C-0877' })).res.status).toBe(201)
	})
	it('records a "submitted" event and does not show the facility publicly until verified', async () => {
		await applicant(t)
		const [events] = (await t.pool.query('select kind, visible from facility_events')) as any
		expect(events).toEqual([{ kind: 'submitted', visible: 0 }])
		expect(await json(await get(t, '/api/facilities'))).toEqual([])
	})
})

describe('my facilities', () => {
	it('lists only the facilities I run, with status, role and code; /me shows them too', async () => {
		const a = await applicant(t, { name: 'Lakeview Hospital' })
		await applicant(t, { name: 'Somebody Else Clinic' })
		const list = await json(await get(t, '/api/my-facilities', auth(a.body.accessToken)))
		expect(list.map((f: any) => f.name)).toEqual(['Lakeview Hospital'])
		expect(list[0]).toMatchObject({ status: 'pending', role: 'admin' })
		const me = await json(await get(t, '/api/me', auth(a.body.accessToken)))
		expect(me.managedFacilities).toEqual([{ id: a.facility.id, name: 'Lakeview Hospital', status: 'pending', role: 'admin' }])
	})
	it('one facility: members only (404 for anyone else), with the messages meant for the applicant', async () => {
		const a = await applicant(t)
		const other = await signup(t)
		expect((await get(t, `/api/my-facilities/${a.facility.id}`, auth(other.body.accessToken))).status).toBe(404)
		const one = await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))
		expect(one).toMatchObject({ id: a.facility.id, status: 'pending', messages: [] })
	})
})

describe('answering a question and correcting a rejection', () => {
	const decide = (token: string, id: string, body: unknown) => post(t, `/api/admin/facilities/${id}/decision`, body, auth(token))
	it('a reply is only possible while more information is needed (409), and puts it back in the queue', async () => {
		const a = await applicant(t)
		const ad = await admin(t)
		expect((await post(t, `/api/my-facilities/${a.facility.id}/reply`, { text: 'Here you go' }, auth(a.body.accessToken))).status).toBe(409)
		await decide(ad.body.accessToken, a.facility.id, { action: 'ask', text: 'Please send the license as printed.' })
		expect((await post(t, `/api/my-facilities/${a.facility.id}/reply`, { text: '' }, auth(a.body.accessToken))).status).toBe(422)
		const res = await post(t, `/api/my-facilities/${a.facility.id}/reply`, { text: 'KSM-H-0102, as printed.' }, auth(a.body.accessToken))
		expect(res.status).toBe(200)
		expect((await json(res)).status).toBe('pending')
		const one = await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))
		expect(one.messages.map((m: any) => m.kind)).toEqual(['ask', 'reply'])
	})
	it('only a rejected facility can be corrected and sent again (409 otherwise); it goes back to pending', async () => {
		const a = await applicant(t)
		const ad = await admin(t)
		expect((await put(`/api/my-facilities/${a.facility.id}`, a.body.accessToken, facilityBody())).status).toBe(409)
		await decide(ad.body.accessToken, a.facility.id, { action: 'reject', text: 'We could not confirm this with the licensing body.' })
		const res = await put(`/api/my-facilities/${a.facility.id}`, a.body.accessToken, facilityBody({ name: 'Lakeview Hospital Kisumu', licenseNumber: 'KSM-H-0102' }))
		expect(res.status).toBe(200)
		expect(await json(res)).toMatchObject({ status: 'pending', name: 'Lakeview Hospital Kisumu', licenseNumber: 'KSM-H-0102' })
		expect((await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))).facilityCode).toBe(a.facility.facilityCode) // the code stays
	})
	it('nobody but a member can reply or correct (404)', async () => {
		const a = await applicant(t)
		const other = await signup(t)
		expect((await post(t, `/api/my-facilities/${a.facility.id}/reply`, { text: 'hello' }, auth(other.body.accessToken))).status).toBe(404)
		expect((await put(`/api/my-facilities/${a.facility.id}`, other.body.accessToken, facilityBody())).status).toBe(404)
	})
})
