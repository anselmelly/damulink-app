import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { json, login, makeTestApp, resetAccounts } from './helpers'
import { call, confirmBody, desk, fq, requestBody, requester, sendRequest, sent } from './request-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	await resetAccounts(t)
	clock.set('2026-11-14T08:00:00Z')
})
afterAll(() => t.pool.end())

describe('the daily cap', () => {
	it('allows 3 a day, blocks the 4th with the reset time, and resets at midnight Nairobi', async () => {
		clock.set('2026-11-14T20:00:00Z') // 23:00 in Nairobi
		const d = await desk(t)
		const tok = d.who.body.accessToken
		for (let i = 0; i < 3; i++) await sent(t, tok, d.id)
		const res = await sendRequest(t, tok, d.id)
		expect(res.status).toBe(429)
		const e = (await json(res)).error
		expect(e.code).toBe('daily_limit')
		expect(e.fields.resetsAt).toBe('2026-11-14T21:00:00.000Z') // 00:00 Nairobi
		clock.set('2026-11-14T21:00:00Z')
		const again = await json(await login(t, d.who.input.email, d.who.input.password)) // the earlier access token has expired by now
		expect((await sendRequest(t, again.accessToken, d.id, { neededBy: '2026-11-17T08:00:00Z' })).status).toBe(201)
	})

	it('counts a cancelled request too, and each person separately', async () => {
		const d = await desk(t)
		const tok = d.who.body.accessToken
		for (let i = 0; i < 3; i++) await call(t, 'POST', `/api/requests/${(await sent(t, tok, d.id)).id}/cancel`, tok)
		expect((await sendRequest(t, tok, d.id)).status).toBe(429)
		const other = await requester(t)
		expect((await sendRequest(t, other.body.accessToken, d.id)).status).toBe(201)
	})
})

describe('one open request per patient and facility', () => {
	it('matches spelling and spacing variants, and returns the number of the open one', async () => {
		const d = await desk(t)
		const first = await sent(t, d.who.body.accessToken, d.id, { patientRef: 'Ward 4, bed 12' })
		for (const variant of ['ward 4 bed 12', 'WARD 4,   BED 12', ' Ward 4. Bed 12 ']) {
			const res = await sendRequest(t, (await requester(t)).body.accessToken, d.id, { patientRef: variant })
			expect(res.status).toBe(409)
			const e = (await json(res)).error
			expect(e.code).toBe('already_open')
			expect(e.fields.number).toBe(first.number)
		}
	})

	it('gives the id of the open request only to the person who sent it', async () => {
		const d = await desk(t)
		const first = await sent(t, d.who.body.accessToken, d.id, { patientRef: 'Ward 2, bed 5' })
		const own = (await json(await sendRequest(t, d.who.body.accessToken, d.id, { patientRef: 'ward 2 bed 5' }))).error
		expect(own.fields).toMatchObject({ number: first.number, id: first.id })
		const theirs = (await json(await sendRequest(t, (await requester(t)).body.accessToken, d.id, { patientRef: 'ward 2 bed 5' }))).error
		expect(theirs.fields.id).toBeUndefined()
	})

	it('lets another ward, or another facility, through', async () => {
		const d = await desk(t)
		const d2 = await desk(t)
		await sent(t, d.who.body.accessToken, d.id, { patientRef: 'Ward 4, bed 12' })
		expect((await sendRequest(t, d.who.body.accessToken, d.id, { patientRef: 'Ward 4, bed 13' })).status).toBe(201)
		expect((await sendRequest(t, d.who.body.accessToken, d2.id, { patientRef: 'Ward 4, bed 12' })).status).toBe(201)
	})

	it('frees the patient again once the request is cancelled or rejected', async () => {
		const d = await desk(t)
		const tok = d.who.body.accessToken
		const a = await sent(t, tok, d.id, { patientRef: 'Bed 1' })
		expect((await sendRequest(t, tok, d.id, { patientRef: 'bed 1' })).status).toBe(409)
		await call(t, 'POST', `/api/requests/${a.id}/cancel`, tok)
		const b = await sent(t, tok, d.id, { patientRef: 'bed 1' })
		await call(t, 'POST', fq(d.id, `/${b.id}/reject`), d.adminToken, { reason: 'other' })
		expect((await sendRequest(t, tok, d.id, { patientRef: 'Bed 1' })).status).toBe(201)
	})

	it('keeps a confirmed or approved request open too', async () => {
		const d = await desk(t)
		const a = await sent(t, d.who.body.accessToken, d.id, { patientRef: 'Bed 9' })
		await call(t, 'POST', fq(d.id, `/${a.id}/confirm`), d.attendant.body.accessToken, confirmBody)
		await call(t, 'POST', fq(d.id, `/${a.id}/approve`), d.adminToken)
		expect((await sendRequest(t, (await requester(t)).body.accessToken, d.id, { patientRef: 'Bed 9' })).status).toBe(409)
	})
})
