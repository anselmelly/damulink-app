import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { call, confirmBody, desk, fq, requester, sent } from './request-helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const queue = async (token: string, id: string, qs = '') => json(await get(t, fq(id, qs), auth(token)))

describe('the facility queue', () => {
	it('lists by status with counts for the tabs, oldest waiting first', async () => {
		const d = await desk(t)
		const a = await sent(t, d.who.body.accessToken, d.id)
		t.clock.advance(60_000)
		const b = await sent(t, (await requester(t)).body.accessToken, d.id)
		t.clock.advance(60_000)
		const c = await sent(t, (await requester(t)).body.accessToken, d.id)
		await call(t, 'POST', fq(d.id, `/${c.id}/confirm`), d.adminToken, confirmBody)
		const all = await queue(d.attendant.body.accessToken, d.id)
		expect(all.counts).toMatchObject({ pending: 2, confirmed: 1 })
		expect(all.counts.approved).toBeUndefined() // only statuses that have rows are listed
		const pending = await queue(d.attendant.body.accessToken, d.id, '?status=pending')
		expect(pending.items.map((r: any) => r.id)).toEqual([a.id, b.id])
		expect((await queue(d.attendant.body.accessToken, d.id, '?status=confirmed')).items.map((r: any) => r.id)).toEqual([c.id])
	})

	it('takes several statuses at once, for a "Closed" tab that means closed, rejected and cancelled', async () => {
		const d = await desk(t)
		const a = await sent(t, d.who.body.accessToken, d.id)
		const b = await sent(t, (await requester(t)).body.accessToken, d.id)
		await sent(t, (await requester(t)).body.accessToken, d.id)
		await call(t, 'POST', fq(d.id, `/${a.id}/reject`), d.adminToken, { reason: 'other' })
		await call(t, 'POST', `/api/requests/${b.id}/cancel`, (await requester(t)).body.accessToken) // not the owner: refused
		await call(t, 'POST', fq(d.id, `/${b.id}/reject`), d.adminToken, { reason: 'other' })
		const both = await queue(d.attendant.body.accessToken, d.id, '?status=rejected,cancelled')
		expect(both.items.map((r: any) => r.id).sort()).toEqual([a.id, b.id].sort())
		expect((await queue(d.attendant.body.accessToken, d.id, '?status=pending,rejected')).items).toHaveLength(3)
	})

	it('searches by number, ward or requester name, and filters by blood type', async () => {
		const d = await desk(t)
		const a = await sent(t, d.who.body.accessToken, d.id, { patientRef: 'Maternity bed 3', bloodType: 'O-' })
		await sent(t, (await requester(t)).body.accessToken, d.id, { patientRef: 'Surgical bed 8', bloodType: 'B+' })
		const tok = d.attendant.body.accessToken
		expect((await queue(tok, d.id, `?q=${a.number}`)).items.map((r: any) => r.id)).toEqual([a.id])
		expect((await queue(tok, d.id, '?q=maternity')).items).toHaveLength(1)
		expect((await queue(tok, d.id, `?q=${encodeURIComponent(d.who.body.user.name)}`)).items.length).toBeGreaterThanOrEqual(1)
		expect((await queue(tok, d.id, '?bloodType=O-')).items.map((r: any) => r.id)).toEqual([a.id])
	})

	it('is for the facility team only, and never shows another facility its requests', async () => {
		const d = await desk(t)
		const other = await desk(t)
		await sent(t, d.who.body.accessToken, d.id)
		expect((await get(t, fq(d.id), auth(d.who.body.accessToken))).status).toBe(404) // a donor, not on the team
		expect((await get(t, fq(d.id), auth(other.adminToken))).status).toBe(404) // another facility's admin
		expect((await get(t, fq(d.id))).status).toBe(401)
		expect((await queue(other.adminToken, other.id)).items).toHaveLength(0)
	})

	it('lets a facility raise its own request, which starts approved with the values typed in', async () => {
		const d = await desk(t)
		const res = await call(t, 'POST', fq(d.id), d.attendant.body.accessToken, { patientRef: 'ICU bed 2', patientName: 'Own Patient', bloodType: 'AB-', units: 3, urgency: 'surge', neededBy: '2026-11-15T08:00:00Z', internalNote: 'Road accident' })
		expect(res.status).toBe(201)
		const r = await json(res)
		expect(r.status).toBe('approved')
		const det = await json(await get(t, fq(d.id, `/${r.id}`), auth(d.attendant.body.accessToken)))
		expect(det).toMatchObject({ source: 'facility', blood: { bloodType: 'AB-', units: 3, urgency: 'surge' }, internalNote: 'Road accident' })
		expect(det.timeline.map((e: any) => e.kind)).toEqual(['raised'])
		expect((await call(t, 'POST', fq(d.id), d.attendant.body.accessToken, { patientRef: 'x', bloodType: 'unsure', units: 1, urgency: 'normal', neededBy: '2026-11-15T08:00:00Z' })).status).toBe(422)
	})

	it('only a verified facility can use its queue for decisions or raising', async () => {
		const d = await desk(t)
		await t.pool.query('update facilities set status = ? where id = ?', ['suspended', d.id])
		const res = await call(t, 'POST', fq(d.id), d.adminToken, { patientRef: 'x', bloodType: 'A+', units: 1, urgency: 'normal', neededBy: '2026-11-15T08:00:00Z' })
		expect(res.status).toBe(403)
		expect((await json(res)).error.code).toBe('facility_not_verified')
	})
})
