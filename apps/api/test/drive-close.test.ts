import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { setSetting } from '@damu/db'
import { fixedClock } from '../src/lib/clock'
import { tick as cron } from './alert-helpers'
import { json, makeTestApp, resetAccounts, signup } from './helpers'
import { call } from './request-helpers'
import { outcome, verifiedDonor, walkinUrl } from './checkin-helpers'
import { dayDrive, dclose, ddownload, driveDesk, dsummary, dv, say } from './drive-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
})
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const walk = (d: { token: string; id: string }, over: Record<string, unknown> = {}) => call(t, 'POST', walkinUrl(d.id), d.token, { name: 'Peter Mwangi', sex: 'male', dateOfBirth: '1990-03-02', outcome: 'donated', ...over })
const tick = () => cron(t)
const status = async (id: string) => (await rows('select status from drives where id = ?', [id]))[0].status
const left = async () => (await rows('select count(*) n from drive_interest'))[0].n

/** A drive with some of everything on the day. */
async function busy() {
	const d = await driveDesk(t)
	const m = await dayDrive(t, d, { target: 10 })
	await say(t, m.code, { name: 'Peter Mwangi', phone: '0722111377' })
	await say(t, m.code, { name: 'Grace Chebet' })
	await say(t, m.code, { name: 'Esther Wairimu' })
	const r = await rows('select id from drive_interest order by created_at')
	await t.pool.query('update drive_interest set arrived_at = ? where id in (?, ?)', [clock.now(), r[0].id, r[1].id])
	const [a, b, c] = [await verifiedDonor(t), await verifiedDonor(t), await verifiedDonor(t)]
	await outcome(t, d.token, d.id, a.code, { outcome: 'donated', weightKg: 70, driveId: m.id })
	await outcome(t, d.token, d.id, b.code, { outcome: 'test', weightKg: 70, bloodType: 'O-', driveId: m.id })
	await outcome(t, d.token, d.id, c.code, { outcome: 'deferred', driveId: m.id })
	await walk(d, { driveId: m.id, bloodType: 'A+' })
	await walk(d, { driveId: m.id })
	return { d, m }
}

describe('POST /drives/:did/close', () => {
	it('closes: the page comes down, the interested list is deleted, the counts stay', async () => {
		const { d, m } = await busy()
		expect(await left()).toBe(3)
		expect((await dclose(t, d, m.id)).status).toBe(200)
		expect(await status(m.id)).toBe('closed')
		expect(await left()).toBe(0)
		expect((await json(await t.app.request(`/api/public/drives/${m.code}`))).state).toBe('ended')
		expect((await rows('select closed_at, interest_total, interest_came from drives where id = ?', [m.id]))[0]).toMatchObject({ interest_total: 3, interest_came: 2 })
		expect((await rows(`select count(*) n from audit_log where action = 'drive.close' and target = ?`, [m.id]))[0].n).toBe(1)
	})

	it('any team member can close; a donor, another facility, a draft or an unstarted drive cannot; closing twice is 409', async () => {
		const { d, m } = await busy()
		expect((await dclose(t, d, m.id, (await signup(t)).body.accessToken)).status).toBe(404)
		expect((await dclose(t, d, m.id, (await driveDesk(t)).token)).status).toBe(404)
		expect((await dclose(t, d, m.id)).status).toBe(200)
		expect((await dclose(t, d, m.id)).status).toBe(409)
		const early = (await json(await call(t, 'POST', dv(d.id), d.token, { host: 'X Host', venue: 'Hall', town: 'Nakuru', date: '2026-11-20', starts: '09:00', ends: '15:00', publicText: 'Come and give blood at the hall.' }))) as { id: string }
		expect((await dclose(t, d, early.id)).status).toBe(409)
		await call(t, 'POST', dv(d.id, `/${early.id}/publish`), d.token, { isPublic: true, smsEnabled: false })
		expect((await dclose(t, d, early.id)).status).toBe(409)
	})

	it('a closed drive cannot be edited or cancelled', async () => {
		const { d, m } = await busy()
		await dclose(t, d, m.id)
		expect((await call(t, 'PATCH', dv(d.id, `/${m.id}`), d.token, { venue: 'Somewhere else' })).status).toBe(409)
		expect((await call(t, 'POST', dv(d.id, `/${m.id}/cancel`), d.token)).status).toBe(409)
	})
})

describe('GET /drives/:did/summary', () => {
	it('counts only: checked in, donated, deferred, tested, who came, blood types', async () => {
		const { d, m } = await busy()
		expect((await dsummary(t, d, m.id)).status).toBe(409) // not closed yet
		await dclose(t, d, m.id)
		const out = await json(await dsummary(t, d, m.id))
		expect(out).toMatchObject({ code: m.code, host: 'Greenfield Secondary School', date: '2026-11-14', target: 10 })
		expect(out.counts).toEqual({ checkedIn: 5, donated: 3, deferred: 1, tested: 1, walkins: 2, byCode: 3 })
		expect(out.percent).toBe(30)
		expect(out.came).toEqual({ interested: 3, interestedCame: 2, byCode: 3, walkins: 2, signups: 0 })
		expect(out.bloodTypes).toEqual({ 'O-': 1, 'A+': 1 })
		const text = JSON.stringify(out)
		for (const secret of ['Peter', 'Mwangi', 'Grace', 'Esther', '722111377']) expect(text).not.toContain(secret)
	})

	it('is for this facility only', async () => {
		const { d, m } = await busy()
		await dclose(t, d, m.id)
		expect((await dsummary(t, d, m.id, (await driveDesk(t)).token)).status).toBe(404)
		expect((await dsummary(t, d, m.id, (await signup(t)).body.accessToken)).status).toBe(404)
	})

	it('downloads as CSV with counts only', async () => {
		const { d, m } = await busy()
		await dclose(t, d, m.id)
		const res = await ddownload(t, d, m.id)
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toContain('text/csv')
		expect(res.headers.get('content-disposition')).toContain(m.code)
		const csv = await res.text()
		expect(csv).toContain('Checked in,5')
		expect(csv).toContain('Donated,3')
		for (const secret of ['Peter', 'Grace', '722111377']) expect(csv).not.toContain(secret)
	})
})

describe('the clean-up (runs with the cron tick)', () => {
	it('closes a drive still open the day after its date, and deletes its interested list', async () => {
		const d = await driveDesk(t)
		const m = await dayDrive(t, d)
		await say(t, m.code, { name: 'Peter Mwangi', phone: '0722111377' })
		clock.set('2026-11-14T20:30:00Z') // 23:30 Nairobi: still the day itself
		await tick()
		expect(await status(m.id)).toBe('published')
		clock.set('2026-11-14T21:10:00Z') // 00:10 next day
		await tick()
		expect(await status(m.id)).toBe('closed')
		expect(await left()).toBe(0)
		expect((await rows('select closed_at, interest_total from drives where id = ?', [m.id]))[0].interest_total).toBe(1)
	})

	it('deletes interest rows older than the retention setting on a drive that is over, even a cancelled one', async () => {
		const d = await driveDesk(t)
		const m = await dayDrive(t, d, { starts: '11:30' })
		await say(t, m.code, { name: 'Peter Mwangi' })
		await setSetting(t.db, 'retention.drive_rsvp_days', 3, clock.now())
		await call(t, 'POST', dv(d.id, `/${m.id}/cancel`), d.token)
		await t.pool.query(`insert into drive_interest (id, drive_id, name, created_at) values ('OLDROW', ?, 'Old Row', '2026-11-01 00:00:00')`, [m.id])
		await tick()
		expect(await left()).toBe(0) // cancelling already deleted the list; the old row goes by retention
	})

	it('leaves other drives and unpublished ones alone', async () => {
		const d = await driveDesk(t)
		const m = (await json(await call(t, 'POST', dv(d.id), d.token, { host: 'X Host', venue: 'Hall', town: 'Nakuru', date: '2026-11-20', starts: '09:00', ends: '15:00', publicText: 'Come and give blood at the hall.' }))) as { id: string; code: string }
		await call(t, 'POST', dv(d.id, `/${m.id}/publish`), d.token, { isPublic: true, smsEnabled: false })
		await say(t, m.code, { name: 'Peter Mwangi' })
		clock.set('2026-11-14T21:10:00Z')
		await tick()
		expect(await status(m.id)).toBe('published')
		expect(await left()).toBe(1)
	})
})
