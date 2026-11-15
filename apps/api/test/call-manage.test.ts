import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { cq, detail, live, respond } from './call-helpers'
import { call, fq } from './request-helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const act = (token: string, id: string, cid: string, what: string, body?: unknown) => call(t, 'POST', cq(id, `/${cid}/${what}`), token, body)

describe('the donors who said yes', () => {
	it('shows name, masked phone, type, ring and status to the team, and the units math', async () => {
		const l = await live(t, { units: 3 })
		const r1 = await respond(t, l.c.id)
		await respond(t, l.c.id, { status: 'scheduled', scheduledAt: new Date('2026-11-15T09:00:00Z') })
		await respond(t, l.c.id, { status: 'donated' })
		const d = await detail(t, l.attendant.body.accessToken, l.id, l.c.id)
		expect(d.units).toEqual({ needed: 3, donated: 1, scheduled: 1, stillNeeded: 1 })
		expect(d.responses).toHaveLength(3)
		const row = d.responses.find((x: any) => x.id === r1.id)
		expect(row).toMatchObject({ name: 'Brian Otieno', status: 'willing', ring: 1 })
		expect(row.phone).toMatch(/•/)
		expect(JSON.stringify(d)).not.toContain(r1.donor.input.email)
		expect(JSON.stringify(d)).not.toContain(r1.donor.input.phone)
	})
	it('still needed never goes below zero', async () => {
		const l = await live(t, { units: 1 })
		await respond(t, l.c.id, { status: 'donated' })
		await respond(t, l.c.id, { status: 'donated' })
		expect((await detail(t, l.adminToken, l.id, l.c.id)).units.stillNeeded).toBe(0)
	})
	it('schedules a donor for a future time and marks one as not needed', async () => {
		const l = await live(t)
		const a = await respond(t, l.c.id)
		const b = await respond(t, l.c.id)
		const path = (id: string, w: string) => `/${l.c.id}/responses/${id}/${w}`
		expect((await call(t, 'POST', cq(l.id, path(a.id, 'schedule')), l.adminToken, { scheduledAt: '2026-11-13T09:00:00Z' })).status).toBe(422) // past
		expect((await call(t, 'POST', cq(l.id, path(a.id, 'schedule')), l.adminToken, { scheduledAt: '2026-11-15T09:00:00Z' })).status).toBe(200)
		expect((await call(t, 'POST', cq(l.id, path(b.id, 'not-needed')), l.adminToken)).status).toBe(200)
		const d = await detail(t, l.adminToken, l.id, l.c.id)
		expect(d.responses.find((x: any) => x.id === a.id)).toMatchObject({ status: 'scheduled', scheduledAt: '2026-11-15T09:00:00.000Z' })
		expect(d.responses.find((x: any) => x.id === b.id).status).toBe('not_needed')
		// not-needed is final
		expect((await call(t, 'POST', cq(l.id, path(b.id, 'schedule')), l.adminToken, { scheduledAt: '2026-11-15T09:00:00Z' })).status).toBe(409)
	})
	it('another facility cannot touch the response', async () => {
		const l = await live(t)
		const x = await respond(t, l.c.id)
		const other = await live(t)
		expect((await call(t, 'POST', cq(other.id, `/${l.c.id}/responses/${x.id}/not-needed`), other.adminToken)).status).toBe(404)
	})
})

describe('editing, extending and closing', () => {
	it('edits the text and the types while live, with the same rules as publishing', async () => {
		const l = await live(t)
		const edit = (body: unknown) => call(t, 'PATCH', cq(l.id, `/${l.c.id}`), l.attendant.body.accessToken, body)
		expect((await edit({ publicText: 'Still looking for A+ donors this week.', types: ['A+', 'O+'] })).status).toBe(200)
		const d = await detail(t, l.adminToken, l.id, l.c.id)
		expect(d).toMatchObject({ publicText: 'Still looking for A+ donors this week.', types: ['A+', 'O+'] })
		expect((await edit({ types: ['B+'] })).status).toBe(422)
		expect((await edit({ publicText: 'x'.repeat(141) })).status).toBe(422)
	})
	it('extends by 1 to 3 days up to 7 days in all', async () => {
		const l = await live(t)
		const ext = (days: number) => act(l.adminToken, l.id, l.c.id, 'extend', { days })
		expect((await ext(0)).status).toBe(422)
		expect((await ext(4)).status).toBe(422)
		const ok = await ext(3)
		expect(ok.status).toBe(200)
		expect(new Date((await json(ok)).closesAt).getTime() - t.clock.now().getTime()).toBe(6 * 86_400_000)
		expect((await ext(2)).status).toBe(422) // would pass 7 days
		expect((await ext(1)).status).toBe(200)
		expect((await ext(1)).status).toBe(422)
		expect((await detail(t, l.adminToken, l.id, l.c.id)).extendedDays).toBe(4)
	})
	it('closing records the reason, closes the request and ends the public page', async () => {
		const l = await live(t)
		const res = await act(l.attendant.body.accessToken, l.id, l.c.id, 'close', { reason: 'covered' })
		expect(res.status).toBe(200)
		const d = await detail(t, l.adminToken, l.id, l.c.id)
		expect(d).toMatchObject({ status: 'closed', closeReason: 'covered' })
		expect((await json(await get(t, fq(l.id, `/${l.r.id}`), auth(l.adminToken)))).status).toBe('closed')
		expect((await act(l.adminToken, l.id, l.c.id, 'close', { reason: 'covered' })).status).toBe(409)
		expect((await act(l.adminToken, l.id, l.c.id, 'extend', { days: 1 })).status).toBe(409)
		expect((await act(l.adminToken, l.id, l.c.id, 'close', { reason: 'nonsense' })).status).toBe(422)
	})
	it('people outside the team cannot read or change the call', async () => {
		const l = await live(t)
		expect((await get(t, cq(l.id, `/${l.c.id}`), auth(l.who.body.accessToken))).status).toBe(404)
		expect((await act(l.who.body.accessToken, l.id, l.c.id, 'close', { reason: 'covered' })).status).toBe(404)
	})
})

describe('what the requester sees', () => {
	it('the call number, link and how many units are covered, and no donor data', async () => {
		const l = await live(t, { units: 2 })
		const x = await respond(t, l.c.id, { status: 'donated' })
		await respond(t, l.c.id)
		const r = await json(await get(t, `/api/requests/${l.r.id}`, auth(l.who.body.accessToken)))
		expect(r.status).toBe('published')
		expect(r.call).toMatchObject({ number: l.c.number, short: l.c.short, status: 'live', units: 2, covered: 1 })
		const text = JSON.stringify(r)
		expect(text).not.toContain(x.donor.input.email)
		expect(text).not.toContain('Brian')
		expect(text).not.toContain('responses')
	})
	it('cancelling a published request closes its call', async () => {
		const l = await live(t)
		const res = await call(t, 'POST', `/api/requests/${l.r.id}/cancel`, l.who.body.accessToken, {})
		expect(res.status).toBe(200)
		expect(await detail(t, l.adminToken, l.id, l.c.id)).toMatchObject({ status: 'closed', closeReason: 'cancelled' })
	})
})
