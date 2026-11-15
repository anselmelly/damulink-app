import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTestApp, resetAccounts } from './helpers'
import { checkinDesk, outcome, verifiedDonor } from './checkin-helpers'
import { matchDonors } from '../src/lib/alerts'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

async function ids(facilityId: string) {
	const rows = await matchDonors(t.db, { facilityId, types: ['O-'], urgency: 'urgent', now: t.clock.now(), limits: false } as any)
	return rows.map((r) => r.user.id)
}

describe('a deferral can pause alerts', () => {
	it('a donor deferred with a future date is not alerted until that date', async () => {
		const d = await checkinDesk(t)
		await t.pool.query(`update facilities set lat = -0.3, lng = 36.0 where id = ?`, [d.id])
		const p = await verifiedDonor(t, { home_facility_id: d.id, sms_opt_in: 1 })
		await t.pool.query(`update users set home_facility_id = ? where id = ?`, [d.id, p.id])
		expect(await ids(d.id)).toContain(p.id)
		await outcome(t, d.token, d.id, p.code, { outcome: 'deferred', returnAfter: '2027-01-04' })
		expect(await ids(d.id)).not.toContain(p.id)
		t.clock.set('2027-01-05T08:00:00Z')
		expect(await ids(d.id)).toContain(p.id)
	})

	it('a deferral with no date pauses nothing', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { sms_opt_in: 1 })
		await t.pool.query(`update users set home_facility_id = ? where id = ?`, [d.id, p.id])
		await outcome(t, d.token, d.id, p.code, { outcome: 'deferred' })
		expect(await ids(d.id)).toContain(p.id)
	})

	it('a later visit ends the pause at once', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { sms_opt_in: 1 })
		await t.pool.query(`update users set home_facility_id = ? where id = ?`, [d.id, p.id])
		await outcome(t, d.token, d.id, p.code, { outcome: 'deferred', returnAfter: '2027-01-04' })
		t.clock.advance(60_000)
		await outcome(t, d.token, d.id, p.code, { outcome: 'test', bloodType: 'O-' })
		expect(await ids(d.id)).toContain(p.id)
	})
})
