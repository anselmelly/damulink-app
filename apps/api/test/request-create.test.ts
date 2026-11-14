import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addFacility, auth, get, json, makeTestApp, post, resetAccounts, signup } from './helpers'
import { call, desk, requestBody, requester, sendRequest } from './request-helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())

describe('sending a request for blood', () => {
	it('stores it as pending with a running number and a first event', async () => {
		const d = await desk(t)
		const res = await sendRequest(t, d.who.body.accessToken, d.id)
		expect(res.status).toBe(201)
		const r = await json(res)
		expect(r).toMatchObject({ status: 'pending', number: expect.stringMatching(/^REQ-\d{4}$/) })
		const detail = await json(await get(t, `/api/requests/${r.id}`, auth(d.who.body.accessToken)))
		expect(detail.timeline.map((e: any) => e.kind)).toEqual(['sent'])
		const second = await json(await sendRequest(t, d.who.body.accessToken, d.id))
		expect(Number(second.number.slice(4))).toBe(Number(r.number.slice(4)) + 1)
	})

	it('needs a sign-in, a verified phone, and a verified facility', async () => {
		const d = await desk(t)
		expect((await post(t, '/api/requests', requestBody(d.id))).status).toBe(401)
		const noPhone = await signup(t)
		const res = await sendRequest(t, noPhone.body.accessToken, d.id)
		expect(res.status).toBe(403)
		expect((await json(res)).error.code).toBe('phone_unverified')
		const pending = await addFacility(t, 'Pending Clinic', 'Nakuru', 'pending')
		const res2 = await sendRequest(t, d.who.body.accessToken, pending)
		expect(res2.status).toBe(422)
		expect((await json(res2)).error.fields.facilityId).toBeTruthy()
	})

	it.each([
		['blood type not on the list', { bloodType: 'Z+' }, 'bloodType'],
		['no units', { units: 0 }, 'units'],
		['too many units', { units: 11 }, 'units'],
		['needed-by in the past', { neededBy: '2026-11-13T08:00:00Z' }, 'neededBy'],
		['needed-by more than 30 days away', { neededBy: '2026-12-20T08:00:00Z' }, 'neededBy'],
		['surge urgency from a requester', { urgency: 'surge' }, 'urgency'],
		['the genuine box not ticked', { genuine: false }, 'genuine'],
		['no patient reference', { patientRef: '' }, 'patientRef'],
		['an unknown relationship', { relation: 'stranger' }, 'relation'],
	])('refuses %s', async (_n, over, field) => {
		const d = await desk(t)
		const res = await sendRequest(t, d.who.body.accessToken, d.id, over)
		expect(res.status).toBe(422)
		expect((await json(res)).error.fields[field]).toBeTruthy()
	})

	it('accepts "not sure" as the blood type, and people under 18 or over 65', async () => {
		const d = await desk(t)
		expect((await sendRequest(t, d.who.body.accessToken, d.id, { bloodType: 'unsure' })).status).toBe(201)
		const young = await requester(t, { dateOfBirth: '2012-05-01' })
		const old = await requester(t, { dateOfBirth: '1950-05-01' })
		expect((await sendRequest(t, young.body.accessToken, d.id)).status).toBe(201)
		expect((await sendRequest(t, old.body.accessToken, d.id)).status).toBe(201)
	})

	it.each(['family', 'friend', 'colleague', 'community', 'other'])('accepts the relationship "%s"', async (relation) => {
		const d = await desk(t)
		expect((await sendRequest(t, d.who.body.accessToken, d.id, { relation })).status).toBe(201)
	})

	it('never gives two requests the same number when they are sent together', async () => {
		const d = await desk(t)
		const a = await requester(t)
		const b = await requester(t)
		const [x, y] = await Promise.all([sendRequest(t, a.body.accessToken, d.id), sendRequest(t, b.body.accessToken, d.id)])
		expect([x.status, y.status]).toEqual([201, 201])
		expect((await json(x)).number).not.toBe((await json(y)).number)
	})

	it('is not reachable with the wrong kind of call', async () => {
		const d = await desk(t)
		expect((await call(t, 'GET', '/api/requests?bucket=nope', d.who.body.accessToken)).status).toBe(422)
	})
})
