import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { call, fq } from './request-helpers'
import { appt, checkinDesk, donor, outcome, verifiedDonor } from './checkin-helpers'
import { live, respond } from './call-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const home = (id: string, token: string) => call(t, 'GET', `/api/my-facilities/${id}/home`, token)

describe('the facility home', () => {
	it('counts and lists match the data', async () => {
		const l = await live(t, { bloodType: 'A+', units: 3 })
		const tok = l.attendant.body.accessToken
		await respond(t, l.c.id)
		await respond(t, l.c.id, { status: 'donated' })
		await respond(t, l.c.id, { status: 'scheduled', scheduledAt: new Date('2026-11-15T09:00:00Z') })
		// two requests waiting (pending), the oldest first
		const { sent } = await import('./request-helpers')
		const r1 = await sent(t, l.who.body.accessToken, l.id, { bloodType: 'O-', units: 1 })
		t.clock.advance(60_000)
		const r2 = await sent(t, (await (await import('./request-helpers')).requester(t)).body.accessToken, l.id, { bloodType: 'B+', units: 2 })
		// donor requests: one to follow up, one booked today (Nairobi), one checked in today
		const a = await verifiedDonor(t)
		const b = await verifiedDonor(t, {}, { name: 'Samuel Kiprop' })
		const c = await donor(t, {}, { name: 'Joyce Njoki' })
		await appt(t, a.id, l.id)
		await appt(t, b.id, l.id, { status: 'scheduled', scheduled_at: '2026-11-14 08:30:00' }) // 11:30 Nairobi today
		await appt(t, c.id, l.id, { status: 'scheduled', scheduled_at: '2026-11-14 06:30:00' })
		await outcome(t, tok, l.id, c.code, { outcome: 'test', bloodType: 'later' }) // checks in, queues a lab sample
		await appt(t, a.id, l.id, { status: 'scheduled', scheduled_at: '2026-11-20 08:30:00' }) // not today
		const h = await json(await home(l.id, tok))
		expect(h.counts).toEqual({ toReview: 2, activeCalls: 1, followUp: 1, visitsToday: 2, labWaiting: 1 })
		expect(h.waiting.map((x: any) => x.id)).toEqual([r1.id, r2.id])
		expect(h.calls[0]).toMatchObject({ number: l.c.number, yes: 3, donated: 1, scheduled: 1, needed: 3 })
		expect(h.visits.map((x: any) => [x.name, x.checkedIn])).toEqual([['Joyce Njoki', true], ['Samuel Kiprop', false]])
	})

	it('never shows another facility\'s data', async () => {
		const l = await live(t)
		const o = await checkinDesk(t)
		const h = await json(await home(o.id, o.token))
		expect(h.counts).toEqual({ toReview: 0, activeCalls: 0, followUp: 0, visitsToday: 0, labWaiting: 0 })
		expect(h.calls).toEqual([])
	})

	it('works for an attendant; a donor or a stranger gets 404', async () => {
		const d = await checkinDesk(t)
		const o = await checkinDesk(t)
		expect((await home(d.id, d.token)).status).toBe(200)
		expect((await home(d.id, d.who.body.accessToken)).status).toBe(404)
		expect((await home(d.id, o.token)).status).toBe(404)
		expect((await call(t, 'GET', fq(d.id), d.token)).status).toBe(200)
	})
})
