import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { json, makeTestApp, resetAccounts } from './helpers'
import { donor, near, smsCall, toPhones } from './alert-helpers'
import { call } from './request-helpers'
import { cq } from './call-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

async function setup() {
	const s = await smsCall(t)
	const f2 = await near(t, 0.045, 'Siaya')
	const f3 = await near(t, 0.2, 'Siaya')
	const d = [await donor(t, s.a.id), await donor(t, f2.id), await donor(t, f3.id)]
	const c = await json(await s.publishWith())
	return { ...s, c, d }
}
const more = (w: any, token = w.a.adminToken, id = w.c.id) => call(t, 'POST', cq(w.a.id, `/${id}/alert-more`), token)

describe('alert more donors', () => {
	it('sends the next ring now, one ring at a time, and then there is nothing left', async () => {
		const w = await setup()
		expect(toPhones(t)).toEqual([w.d[0].e164])
		expect((await more(w)).status).toBe(200)
		expect(toPhones(t)).toEqual([w.d[0].e164, w.d[1].e164])
		expect((await more(w)).status).toBe(200)
		expect(toPhones(t)).toHaveLength(3)
		const none = await more(w)
		expect(none.status).toBe(409)
		expect((await json(none)).error.code).toBe('invalid_move')
	})
	it('reports the rings: to alert, alerted and replied', async () => {
		const w = await setup()
		const r = await json(await call(t, 'GET', cq(w.a.id, `/${w.c.id}/rings`), w.a.attendant.body.accessToken))
		expect(r.rings).toEqual([
			{ ring: 1, toAlert: 0, alerted: 1, replied: 0 },
			{ ring: 2, toAlert: 1, alerted: 0, replied: 0 },
			{ ring: 3, toAlert: 1, alerted: 0, replied: 0 },
		])
		expect(r.nextRing).toBe(2)
	})
	it('is for the team of a live call with SMS on', async () => {
		const w = await setup()
		expect((await more(w, w.a.who.body.accessToken)).status).toBe(404)
		await call(t, 'POST', cq(w.a.id, `/${w.c.id}/close`), w.a.adminToken, { reason: 'covered' })
		expect((await more(w)).status).toBe(409)
		const w2 = await smsCall(t, { smsEnabled: false, isPublic: true })
		const c2 = await json(await w2.publishWith())
		expect((await call(t, 'POST', cq(w2.a.id, `/${c2.id}/alert-more`), w2.a.adminToken)).status).toBe(409)
	})
})
