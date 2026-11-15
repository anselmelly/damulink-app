import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { cq, detail, fresh, live } from './call-helpers'
import { call, fq } from './request-helpers'
import { expireCalls } from '../src/lib/calls'
import { admin, decideAs } from './helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set(new Date('2026-11-14T08:00:00Z').toISOString())
	await resetAccounts(t)
})
afterAll(() => t.pool.end())
const DAY = 86_400_000

describe('expiry', () => {
	it('a call closes by itself when its time is up, and the request closes with it', async () => {
		const l = await live(t)
		clock.set(new Date(Date.parse('2026-11-14T08:00:00Z') + 3 * DAY - 1000).toISOString())
		expect(await expireCalls(t.db, clock.now())).toBe(0)
		clock.set(new Date(Date.parse('2026-11-14T08:00:00Z') + 3 * DAY).toISOString())
		expect(await expireCalls(t.db, clock.now())).toBe(1)
		expect(await expireCalls(t.db, clock.now())).toBe(0)
		const token = await fresh(t, l.owner)
		expect(await detail(t, token, l.id, l.c.id)).toMatchObject({ status: 'expired' })
		expect((await json(await get(t, fq(l.id, `/${l.r.id}`), auth(token)))).status).toBe('closed')
	})
	it('reading the call or the public list also sweeps, so nothing stale is ever shown', async () => {
		const l = await live(t)
		clock.set(new Date(Date.parse('2026-11-14T08:00:00Z') + 4 * DAY).toISOString())
		expect((await json(await get(t, '/api/public/calls'))).items).toHaveLength(0)
		expect(await detail(t, await fresh(t, l.owner), l.id, l.c.id)).toMatchObject({ status: 'expired' })
	})
	it('an extension moves the time', async () => {
		const l = await live(t)
		await call(t, 'POST', cq(l.id, `/${l.c.id}/extend`), l.adminToken, { days: 2 })
		clock.set(new Date(Date.parse('2026-11-14T08:00:00Z') + 4 * DAY).toISOString())
		expect(await expireCalls(t.db, clock.now())).toBe(0)
		clock.set(new Date(Date.parse('2026-11-14T08:00:00Z') + 5 * DAY).toISOString())
		expect(await expireCalls(t.db, clock.now())).toBe(1)
	})
	it('suspending the facility takes its live calls down, for good', async () => {
		const l = await live(t)
		const ad = await admin(t)
		expect((await decideAs(t, ad.body.accessToken, l.id, { action: 'suspend' })).status).toBe(200)
		expect((await json(await get(t, '/api/public/calls'))).items).toHaveLength(0)
		expect((await get(t, `/api/public/calls/${l.c.number}`)).status).toBe(404)
		expect(await detail(t, l.adminToken, l.id, l.c.id)).toMatchObject({ status: 'taken_down' })
		await decideAs(t, ad.body.accessToken, l.id, { action: 'reactivate' })
		expect(await detail(t, l.adminToken, l.id, l.c.id)).toMatchObject({ status: 'taken_down' })
	})
})
