import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addFacility, auth, get, json, makeTestApp, post, resetAccounts, setDonorFacts, signup, verifyPhone } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

const input = (facilityId: string, over: Record<string, unknown> = {}) => ({ kind: 'test', facilityId, days: ['wed', 'fri'], timeOfDay: 'morning', ...over })
/** A donor with a verified phone and a home facility. */
async function donor(over: Record<string, unknown> = {}) {
	const facility = await addFacility(t, 'Rift County Hospital', 'Nakuru')
	const s = await signup(t, { homeFacilityId: facility, ...over })
	await verifyPhone(t, s.input.email)
	return { ...s, facility }
}
const request = (token: string, body: unknown) => post(t, '/api/me/donation-requests', body, auth(token))

describe('POST /api/me/donation-requests', () => {
	it('needs a session', async () => {
		expect((await post(t, '/api/me/donation-requests', {})).status).toBe(401)
	})
	it('creates a request for the home facility (201, status requested)', async () => {
		const { body, facility } = await donor()
		const res = await request(body.accessToken, input(facility))
		expect(res.status).toBe(201)
		expect(await json(res)).toMatchObject({ kind: 'test', facilityId: facility, facilityName: 'Rift County Hospital', days: ['wed', 'fri'], timeOfDay: 'morning', status: 'requested', scheduledAt: null })
	})
	it('an extra facility works too', async () => {
		const home = await addFacility(t, 'Rift County Hospital')
		const extra = await addFacility(t, 'Lakeview Hospital', 'Kisumu')
		const { body, input: i } = await signup(t, { homeFacilityId: home, extraFacilityIds: [extra] })
		await verifyPhone(t, i.email)
		expect((await request(body.accessToken, input(extra))).status).toBe(201)
	})
	it('a facility that is not yours is 422', async () => {
		const { body } = await donor()
		const other = await addFacility(t, 'Eastlands Hospital', 'Nairobi')
		const res = await request(body.accessToken, input(other))
		expect(res.status).toBe(422)
		expect((await json(res)).error.fields.facilityId).toBeTruthy()
	})
	it('needs a verified phone (403)', async () => {
		const facility = await addFacility(t)
		const { body } = await signup(t, { homeFacilityId: facility })
		const res = await request(body.accessToken, input(facility))
		expect(res.status).toBe(403)
		expect((await json(res)).error.code).toBe('phone_not_verified')
	})
	it('under 18 cannot ask to donate (403)', async () => {
		const { body, facility } = await donor({ dateOfBirth: '2010-03-05' })
		const res = await request(body.accessToken, input(facility))
		expect(res.status).toBe(403)
		expect((await json(res)).error.code).toBe('not_a_donor')
	})
	it('checks the form: kind, days, time of day (422)', async () => {
		const { body, facility } = await donor()
		for (const bad of [{ kind: 'sell' }, { days: [] }, { days: ['funday'] }, { timeOfDay: 'night' }]) expect((await request(body.accessToken, input(facility, bad))).status).toBe(422)
	})
	it('a verified donor has no need of a blood type test (422), but can ask to donate', async () => {
		const { body, input: i, facility } = await donor()
		await setDonorFacts(t, i.email, { blood_type: 'O+' })
		const test = await request(body.accessToken, input(facility, { kind: 'test' }))
		expect(test.status).toBe(422)
		expect((await json(test)).error.code).toBe('already_verified')
		expect((await request(body.accessToken, input(facility, { kind: 'donate' }))).status).toBe(201)
	})
	it('only one open request at a time (409)', async () => {
		const { body, facility } = await donor()
		await request(body.accessToken, input(facility))
		const again = await request(body.accessToken, input(facility, { kind: 'donate' }))
		expect(again.status).toBe(409)
		expect((await json(again)).error.code).toBe('already_requested')
	})
})

describe('listing and cancelling', () => {
	it('lists my requests, newest first, and nobody else\'s', async () => {
		const a = await donor()
		const b = await donor()
		const first = await json(await request(a.body.accessToken, input(a.facility)))
		await post(t, `/api/me/donation-requests/${first.id}/cancel`, {}, auth(a.body.accessToken))
		t.clock.advance(1000)
		const second = await json(await request(a.body.accessToken, input(a.facility, { kind: 'donate' })))
		await request(b.body.accessToken, input(b.facility))
		const list = await json(await get(t, '/api/me/donation-requests', auth(a.body.accessToken)))
		expect(list.map((r: any) => r.id)).toEqual([second.id, first.id])
	})
	it('cancelling frees the donor to ask again', async () => {
		const { body, facility } = await donor()
		const r = await json(await request(body.accessToken, input(facility)))
		const res = await post(t, `/api/me/donation-requests/${r.id}/cancel`, {}, auth(body.accessToken))
		expect(res.status).toBe(200)
		expect((await json(res)).status).toBe('cancelled')
		expect((await request(body.accessToken, input(facility))).status).toBe(201)
	})
	it("someone else's request is 404, and a cancelled one cannot be cancelled again (409)", async () => {
		const a = await donor()
		const b = await donor()
		const r = await json(await request(a.body.accessToken, input(a.facility)))
		expect((await post(t, `/api/me/donation-requests/${r.id}/cancel`, {}, auth(b.body.accessToken))).status).toBe(404)
		await post(t, `/api/me/donation-requests/${r.id}/cancel`, {}, auth(a.body.accessToken))
		expect((await post(t, `/api/me/donation-requests/${r.id}/cancel`, {}, auth(a.body.accessToken))).status).toBe(409)
	})
})
