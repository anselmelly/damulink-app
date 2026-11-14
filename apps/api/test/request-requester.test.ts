import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { call, confirmBody, desk, fq, requester, sent } from './request-helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const detail = async (token: string, id: string) => json(await get(t, `/api/requests/${id}`, auth(token)))

describe('the requester side', () => {
	it('lists only my own requests, newest first, split into active and closed, without patient details', async () => {
		const d = await desk(t)
		const tok = d.who.body.accessToken
		const a = await sent(t, tok, d.id)
		t.clock.advance(60_000)
		const b = await sent(t, tok, d.id)
		await sent(t, (await requester(t)).body.accessToken, d.id) // someone else's
		await call(t, 'POST', `/api/requests/${a.id}/cancel`, tok)
		const active = await json(await get(t, '/api/requests?bucket=active', auth(tok)))
		const closed = await json(await get(t, '/api/requests?bucket=closed', auth(tok)))
		expect(active.map((r: any) => r.id)).toEqual([b.id])
		expect(closed.map((r: any) => r.id)).toEqual([a.id])
		expect(JSON.stringify([active, closed])).not.toMatch(/Test Patient|Ward \d/)
		expect(active[0]).toMatchObject({ number: b.number, status: 'pending', facilityName: expect.any(String), facilityTown: expect.any(String) })
	})

	it('shows the detail to its owner only (404 for anyone else)', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		const body = await detail(d.who.body.accessToken, r.id)
		expect(body).toMatchObject({ number: r.number, status: 'pending', patientRef: expect.any(String), patientName: 'Test Patient', facility: { id: d.id } })
		const other = await requester(t)
		expect((await get(t, `/api/requests/${r.id}`, auth(other.body.accessToken))).status).toBe(404)
		expect((await get(t, `/api/requests/${r.id}`, auth(d.adminToken))).status).toBe(404) // even a facility admin, from this door
	})

	it('shows the open question and takes a reply only while one is waiting', async () => {
		const d = await desk(t)
		const tok = d.who.body.accessToken
		const r = await sent(t, tok, d.id)
		expect((await call(t, 'POST', `/api/requests/${r.id}/reply`, tok, { message: 'hello' })).status).toBe(409)
		await call(t, 'POST', fq(d.id, `/${r.id}/ask`), d.attendant.body.accessToken, { question: 'Which ward is the patient in?' })
		const asked = await detail(tok, r.id)
		expect(asked).toMatchObject({ status: 'needs_info', question: 'Which ward is the patient in?' })
		expect((await call(t, 'POST', `/api/requests/${r.id}/reply`, tok, { message: '' })).status).toBe(422)
		const res = await call(t, 'POST', `/api/requests/${r.id}/reply`, tok, { message: 'Ward 4' })
		expect(res.status).toBe(200)
		const after = await detail(tok, r.id)
		expect(after).toMatchObject({ status: 'pending', question: null })
		expect(after.timeline.map((e: any) => e.kind)).toEqual(['sent', 'asked', 'replied'])
	})

	it('can cancel while open, not after a rejection', async () => {
		const d = await desk(t)
		const tok = d.who.body.accessToken
		const a = await sent(t, tok, d.id)
		expect((await call(t, 'POST', `/api/requests/${a.id}/cancel`, tok)).status).toBe(200)
		expect((await detail(tok, a.id)).status).toBe('cancelled')
		expect((await call(t, 'POST', `/api/requests/${a.id}/cancel`, tok)).status).toBe(409)
		const b = await sent(t, tok, d.id)
		await call(t, 'POST', fq(d.id, `/${b.id}/reject`), d.adminToken, { reason: 'no_match', message: 'We have no stock' })
		expect((await call(t, 'POST', `/api/requests/${b.id}/cancel`, tok)).status).toBe(409)
		const c = await sent(t, tok, d.id)
		await call(t, 'POST', fq(d.id, `/${c.id}/confirm`), d.adminToken, confirmBody)
		await call(t, 'POST', fq(d.id, `/${c.id}/approve`), d.adminToken)
		expect((await call(t, 'POST', `/api/requests/${c.id}/cancel`, tok)).status).toBe(200) // approved is still open
	})

	it('keeps the reason given when cancelling, as part of the history', async () => {
		const d = await desk(t)
		const tok = d.who.body.accessToken
		const a = await sent(t, tok, d.id)
		expect((await call(t, 'POST', `/api/requests/${a.id}/cancel`, tok, { reason: 'Found blood another way' })).status).toBe(200)
		const det = await detail(tok, a.id)
		expect(det.timeline.at(-1)).toMatchObject({ kind: 'cancelled', text: 'Found blood another way' })
		const b = await sent(t, tok, d.id)
		expect((await call(t, 'POST', `/api/requests/${b.id}/cancel`, tok)).status).toBe(200) // the reason is optional
	})

	it('lets the requester read the rejection reason and the message meant for them', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		await call(t, 'POST', fq(d.id, `/${r.id}/reject`), d.adminToken, { reason: 'no_match', message: 'No such patient on that ward' })
		expect(await detail(d.who.body.accessToken, r.id)).toMatchObject({ status: 'rejected', rejectReason: 'no_match', rejectMessage: 'No such patient on that ward' })
	})
})
