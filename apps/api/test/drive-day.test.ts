import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { json, makeTestApp, resetAccounts, signup } from './helpers'
import { call } from './request-helpers'
import { donor, outcome, verifiedDonor, walkinUrl } from './checkin-helpers'
import { darrived, dayDrive, dday, driveDesk, dv, made, publishDrive, say } from './drive-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
})
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const walk = (d: { token: string; id: string }, over: Record<string, unknown> = {}) => call(t, 'POST', walkinUrl(d.id), d.token, { name: 'Peter Mwangi', sex: 'male', dateOfBirth: '1990-03-02', outcome: 'donated', ...over })

describe('GET /drives/:did/day', () => {
	it('before the day: details and a read-only interested list with masked phones', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d, { date: '2026-11-21' })
		await publishDrive(t, d, m.id)
		await say(t, m.code, { name: 'Peter Mwangi', phone: '0722111377' })
		await say(t, m.code, { name: 'Grace Chebet' })
		const p = await donor(t, {}, { name: 'Brian Otieno' })
		await say(t, m.code, undefined, { 'X-Auth': p.body.accessToken })
		const out = await json(await dday(t, d, m.id))
		expect(out).toMatchObject({ phase: 'before', code: m.code, host: 'Greenfield Secondary School', contactName: 'Mr Otieno', counts: { checkedIn: 0, donated: 0, walkins: 0, signups: 0 }, target: 40, canClose: false, canCancel: true })
		expect(out.people).toEqual([
			{ id: expect.any(String), name: 'Peter Mwangi', phone: '+254 7•• ••• 377', source: 'guest', arrived: false },
			{ id: expect.any(String), name: 'Grace Chebet', phone: null, source: 'guest', arrived: false },
			{ id: expect.any(String), name: 'Brian Otieno', phone: expect.stringMatching(/^\+254 [17]•• ••• \d{3}$/), source: 'account', arrived: false },
		])
		expect(JSON.stringify(out)).not.toContain('722111377')
	})

	it('on the day: counts only what was tied to this drive, and the target percent', async () => {
		const d = await driveDesk(t)
		const m = await dayDrive(t, d, { target: 10 })
		const other = await dayDrive(t, d, { starts: '11:30' })
		const [a, b, c, e] = [await verifiedDonor(t), await verifiedDonor(t), await verifiedDonor(t), await verifiedDonor(t)]
		expect((await outcome(t, d.token, d.id, a.code, { outcome: 'donated', weightKg: 70, driveId: m.id })).status).toBe(201)
		expect((await outcome(t, d.token, d.id, b.code, { outcome: 'test', weightKg: 70, bloodType: 'O-', driveId: m.id })).status).toBe(201)
		expect((await outcome(t, d.token, d.id, c.code, { outcome: 'deferred', driveId: m.id })).status).toBe(201)
		expect((await outcome(t, d.token, d.id, e.code, { outcome: 'donated', weightKg: 70 })).status).toBe(201) // not tied
		expect((await walk(d, { driveId: m.id })).status).toBe(201)
		expect((await walk(d, { driveId: m.id, outcome: 'test' })).status).toBe(201)
		expect((await walk(d)).status).toBe(201) // not tied
		expect((await walk(d, { driveId: other.id })).status).toBe(201) // another drive
		await signup(t, { homeFacilityId: d.id }) // signed up with this facility today
		const out = await json(await dday(t, d, m.id))
		expect(out.phase).toBe('day')
		expect(out.counts).toEqual({ checkedIn: 5, donated: 2, walkins: 2, signups: 1 })
		expect(out.percent).toBe(20)
		expect(out.canClose).toBe(true)
		expect(out.canCancel).toBe(false)
		expect(JSON.stringify(out.counts)).not.toMatch(/name|phone/i)
	})

	it('only a team member of this facility; a draft has no day', async () => {
		const d = await driveDesk(t)
		const m = await dayDrive(t, d)
		const other = await driveDesk(t)
		expect((await dday(t, d, m.id, d.adminToken)).status).toBe(200)
		expect((await dday(t, d, m.id, (await signup(t)).body.accessToken)).status).toBe(404)
		expect((await dday(t, d, m.id, other.token)).status).toBe(404)
		expect((await dday(t, d, 'nope')).status).toBe(404)
		const draft = await made(t, d)
		expect((await dday(t, d, draft.id)).status).toBe(409)
	})
})

describe('POST /drives/:did/interest/:iid/arrived', () => {
	it('ticks and unticks arrivals on the day', async () => {
		const d = await driveDesk(t)
		const m = await dayDrive(t, d)
		await say(t, m.code, { name: 'Peter Mwangi', phone: '0722111377' })
		const [r] = await rows('select id from drive_interest')
		expect((await darrived(t, d, m.id, r.id)).status).toBe(200)
		expect((await rows('select arrived_at from drive_interest'))[0].arrived_at).toBeTruthy()
		expect((await json(await dday(t, d, m.id))).people[0].arrived).toBe(true)
		expect((await darrived(t, d, m.id, r.id, false)).status).toBe(200)
		expect((await rows('select arrived_at from drive_interest'))[0].arrived_at).toBeNull()
	})

	it('is locked before the date; an unknown row, another facility, a donor and a bad body are refused', async () => {
		const d = await driveDesk(t)
		const early = await made(t, d, { date: '2026-11-21' })
		await publishDrive(t, d, early.id)
		await say(t, early.code, { name: 'Peter Mwangi' })
		const [r] = await rows('select id from drive_interest')
		expect((await darrived(t, d, early.id, r.id)).status).toBe(409)
		const m = await dayDrive(t, d)
		await say(t, m.code, { name: 'Grace Chebet' })
		const [, g] = await rows('select id from drive_interest order by created_at')
		expect((await darrived(t, d, m.id, 'nope')).status).toBe(404)
		expect((await darrived(t, d, m.id, r.id)).status).toBe(404) // a row of another drive
		expect((await darrived(t, d, m.id, g.id, true, (await driveDesk(t)).token)).status).toBe(404)
		expect((await darrived(t, d, m.id, g.id, true, (await signup(t)).body.accessToken)).status).toBe(404)
		expect((await darrived(t, d, m.id, g.id, 'yes')).status).toBe(422)
	})
})

describe('tying visits and walk-ins to a drive', () => {
	it('a drive id must be a published drive of this facility running today: others are 422 and nothing is recorded', async () => {
		const d = await driveDesk(t)
		const mine = await dayDrive(t, d)
		const draft = await made(t, d, { date: '2026-11-14', starts: '12:00' })
		const later = await made(t, d, { date: '2026-11-20' })
		await publishDrive(t, d, later.id)
		const foreign = await driveDesk(t)
		const fm = await dayDrive(t, foreign)
		const cancelled = await dayDrive(t, d, { starts: '12:30' })
		await call(t, 'POST', dv(d.id, `/${cancelled.id}/cancel`), d.token)
		const p = await verifiedDonor(t)
		for (const id of [draft.id, later.id, fm.id, cancelled.id, 'nope']) {
			const res = await outcome(t, d.token, d.id, p.code, { outcome: 'donated', weightKg: 70, driveId: id })
			expect(res.status, id).toBe(422)
			expect((await json(res)).error.fields.driveId, id).toBeTruthy()
			expect((await walk(d, { driveId: id })).status, id).toBe(422)
		}
		expect(await rows('select id from visits where drive_id is not null')).toHaveLength(0)
		expect(await rows('select id from walkin_visits')).toHaveLength(0)
		expect((await outcome(t, d.token, d.id, p.code, { outcome: 'donated', weightKg: 70, driveId: mine.id })).status).toBe(201)
		expect((await rows('select drive_id from visits where user_id = ?', [p.id]))[0].drive_id).toBe(mine.id)
	})

	it('a walk-in tied to a drive carries it', async () => {
		const d = await driveDesk(t)
		const m = await dayDrive(t, d)
		expect((await walk(d, { driveId: m.id })).status).toBe(201)
		expect((await rows('select drive_id from walkin_visits'))[0].drive_id).toBe(m.id)
	})
})
