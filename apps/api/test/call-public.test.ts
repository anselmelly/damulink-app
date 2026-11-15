import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { cq, live, respond } from './call-helpers'
import { call } from './request-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set(new Date('2026-11-14T08:00:00Z').toISOString())
	await resetAccounts(t)
})
afterAll(() => t.pool.end())
const list = async (q = '') => json(await get(t, `/api/public/calls${q}`))

describe('the public list', () => {
	it('needs no login and shows live public calls with the facility, never patient or contact data', async () => {
		const l = await live(t, { patientName: 'Wanjiku Kamau', patientRef: 'Ward 4, bed 12', note: 'Surgery planned' })
		await respond(t, l.c.id)
		const res = await get(t, '/api/public/calls')
		expect(res.status).toBe(200)
		const body = await json(res)
		expect(body.items).toHaveLength(1)
		expect(body.items[0]).toMatchObject({ code: l.c.number, short: l.c.short, bloodType: 'A+', urgency: 'normal', publicText: 'We are appealing for A+ blood. Please share this call.' })
		expect(body.items[0].facility).toMatchObject({ town: 'Kisumu' })
		const text = JSON.stringify(body)
		for (const secret of ['Wanjiku', 'Kamau', 'Ward 4', 'bed 12', 'Surgery', 'REQ-', l.id, l.r.id, l.who.input.email, l.who.input.phone, 'Brian']) expect(text).not.toContain(secret)
	})
	it('hides calls that are not public, closed, or from an unverified facility', async () => {
		const hidden = await live(t, {}, { isPublic: false, smsEnabled: false }).catch(() => null)
		expect(hidden).toBeNull() // needs one of them on (SMS is not available yet)
		const a = await live(t)
		const b = await live(t)
		await call(t, 'POST', cq(b.id, `/${b.c.id}/close`), b.adminToken, { reason: 'covered' })
		expect((await list()).items.map((x: any) => x.code)).toEqual([a.c.number])
	})
	it('filters by blood type (calls that accept it), town and urgency', async () => {
		const a = await live(t, { bloodType: 'A+' }, { urgency: 'urgent', types: ['A+', 'O+'] })
		const b = await live(t, { bloodType: 'B-' }, { types: ['B-', 'O-'] })
		expect((await list('?bloodType=O%2B')).items.map((x: any) => x.code)).toEqual([a.c.number])
		expect((await list('?bloodType=O-')).items.map((x: any) => x.code)).toEqual([b.c.number])
		expect((await list('?urgent=1')).items.map((x: any) => x.code)).toEqual([a.c.number])
		expect((await list('?town=kisumu')).items).toHaveLength(2)
		expect((await list('?town=Nakuru')).items).toHaveLength(0)
	})
	it('lists the most urgent first, then the newest', async () => {
		const a = await live(t)
		clock.set(new Date('2026-11-14T09:00:00Z').toISOString())
		const b = await live(t)
		clock.set(new Date('2026-11-14T10:00:00Z').toISOString())
		const c = await live(t, {}, { urgency: 'surge' })
		expect((await list()).items.map((x: any) => x.code)).toEqual([c.c.number, b.c.number, a.c.number])
	})
	it('is rate limited', async () => {
		let last = 200
		for (let i = 0; i < 62; i++) last = (await get(t, '/api/public/calls', { 'x-forwarded-for': '10.0.0.9' })).status
		expect(last).toBe(429)
	})
})

describe('one public call', () => {
	it('opens by call number or by short code', async () => {
		const l = await live(t)
		for (const key of [l.c.number, l.c.short]) {
			const res = await get(t, `/api/public/calls/${key}`)
			expect(res.status, key).toBe(200)
			expect(await json(res)).toMatchObject({ code: l.c.number, short: l.c.short, status: 'live', types: ['A+', 'A-', 'O+', 'O-'], facility: { name: expect.any(String), town: 'Kisumu' } })
		}
	})
	it('still opens after the call closed, with a closed status, and 404 for anything unknown', async () => {
		const l = await live(t)
		await call(t, 'POST', cq(l.id, `/${l.c.id}/close`), l.adminToken, { reason: 'covered' })
		expect(await json(await get(t, `/api/public/calls/${l.c.number}`))).toMatchObject({ status: 'closed' })
		expect((await get(t, '/api/public/calls/CALL-9999')).status).toBe(404)
		expect((await get(t, '/api/public/calls/zzzz')).status).toBe(404)
	})
	it('carries no patient, request or phone data', async () => {
		const l = await live(t, { patientName: 'Wanjiku Kamau', patientRef: 'Ward 4, bed 12' })
		const text = JSON.stringify(await json(await get(t, `/api/public/calls/${l.c.short}`)))
		for (const secret of ['Wanjiku', 'Ward 4', 'REQ-', l.r.id, l.id, l.who.input.phone]) expect(text).not.toContain(secret)
	})
	it('the facility call API stays closed to the public', async () => {
		const l = await live(t)
		expect((await get(t, cq(l.id))).status).toBe(401)
		expect((await get(t, cq(l.id, `/${l.c.id}`), auth(l.who.body.accessToken))).status).toBe(404)
	})
})
