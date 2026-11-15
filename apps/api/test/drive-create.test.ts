import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { setSetting } from '@damu/db'
import { json, makeTestApp, resetAccounts, signup, verifiedFacility, applicant } from './helpers'
import { call } from './request-helpers'
import { donor } from './checkin-helpers'
import { driveBody, driveDesk, dv, made } from './drive-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('creating a drive', () => {
	it('saves a draft with a public code and short link', async () => {
		const d = await driveDesk(t)
		const res = await d.make()
		expect(res.status).toBe(201)
		const b = await json(res)
		expect(b.code).toBe('DRIVE-0001')
		expect(b.short).toMatch(/^[a-z0-9]{5}$/)
		expect(b.status).toBe('draft')
		expect((await json(await d.make())).code).toBe('DRIVE-0002')
	})

	it.each([
		[{ date: '2026-11-13' }, 'date'],
		[{ date: '2027-06-01' }, 'date'],
		[{ ends: '08:00' }, 'ends'],
		[{ publicText: 'x'.repeat(201) }, 'publicText'],
		[{ host: '' }, 'host'],
		[{ venue: '' }, 'venue'],
		[{ town: '' }, 'town'],
		[{ contactPhone: '12' }, 'contactPhone'],
	])('rejects %j', async (over, field) => {
		const d = await driveDesk(t)
		const res = await d.make(over)
		expect(res.status).toBe(422)
		expect((await json(res)).error.fields[field]).toBeTruthy()
	})

	it('the target and the host contact are optional', async () => {
		const d = await driveDesk(t)
		expect((await d.make({ target: null, contactName: null, contactPhone: null })).status).toBe(201)
	})

	it('any team member can create, and only verified facilities', async () => {
		const d = await driveDesk(t)
		expect((await d.make({}, d.attendant.body.accessToken)).status).toBe(201)
		const pending = await applicant(t, { name: 'Pending Clinic', licenseNumber: 'LIC-9' })
		const res = await call(t, 'POST', dv(pending.facility.id), pending.body.accessToken, driveBody())
		expect(res.status).toBe(403)
	})

	it('a donor or another facility sees "not found"', async () => {
		const d = await driveDesk(t)
		const p = await donor(t)
		expect((await call(t, 'POST', dv(d.id), p.body.accessToken, driveBody())).status).toBe(404)
		const other = await verifiedFacility(t, { name: 'Other Hospital', licenseNumber: 'LIC-2' })
		expect((await call(t, 'POST', dv(d.id), other.owner.body.accessToken, driveBody())).status).toBe(404)
	})

	it('stops at the open-drive limit', async () => {
		await setSetting(t.db, 'drives.max_open', 2, t.clock.now())
		const d = await driveDesk(t)
		await d.make()
		await d.make()
		const res = await d.make()
		expect(res.status).toBe(409)
		expect((await json(res)).error.code).toBe('too_many_drives')
	})

	it('writes an audit row with no personal data', async () => {
		const d = await driveDesk(t)
		await d.make()
		const [rows] = (await t.pool.query(`select action, detail from audit_log where action = 'drive.create'`)) as any
		expect(rows).toHaveLength(1)
		expect(JSON.stringify(rows)).not.toMatch(/Otieno|0712345678|Greenfield/)
	})
})

describe('seeing and changing a drive', () => {
	it('the detail has the host contact for the team and the list does not', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		const detail = await json(await call(t, 'GET', dv(d.id, `/${m.id}`), d.token))
		expect(detail.contactName).toBe('Mr Otieno')
		expect(detail.contactPhone).toBe('+254712345678')
		const list = await json(await call(t, 'GET', dv(d.id), d.token))
		expect(JSON.stringify(list)).not.toMatch(/Otieno|254712345678/)
	})

	it('the list has tabs and counts', async () => {
		const d = await driveDesk(t)
		await made(t, d)
		await made(t, d, { date: '2026-11-14', starts: '15:00', ends: '17:00' })
		const up = await json(await call(t, 'GET', dv(d.id), d.token))
		expect(up.counts).toEqual({ upcoming: 1, today: 1, past: 0 })
		expect(up.items.map((i: any) => i.code)).toEqual(['DRIVE-0001'])
		const today = await json(await call(t, 'GET', dv(d.id, '?tab=today'), d.token))
		expect(today.items.map((i: any) => i.code)).toEqual(['DRIVE-0002'])
		expect((await call(t, 'GET', dv(d.id, '?tab=nope'), d.token)).status).toBe(422)
	})

	it('can be edited and cancelled before it starts', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		const res = await call(t, 'PATCH', dv(d.id, `/${m.id}`), d.token, { venue: 'Main hall', ends: '16:00' })
		expect(res.status).toBe(200)
		expect((await json(await call(t, 'GET', dv(d.id, `/${m.id}`), d.token))).venue).toBe('Main hall')
		expect((await call(t, 'PATCH', dv(d.id, `/${m.id}`), d.token, { ends: '08:00' })).status).toBe(422)
		expect((await call(t, 'PATCH', dv(d.id, `/${m.id}`), d.token, {})).status).toBe(422)
		expect((await call(t, 'POST', dv(d.id, `/${m.id}/cancel`), d.token)).status).toBe(200)
		expect((await call(t, 'PATCH', dv(d.id, `/${m.id}`), d.token, { venue: 'x1' })).status).toBe(409)
		expect((await call(t, 'POST', dv(d.id, `/${m.id}/cancel`), d.token)).status).toBe(409)
	})

	it('cannot be changed once it has started', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d, { date: '2026-11-14', starts: '09:00', ends: '15:00' })
		const res = await call(t, 'PATCH', dv(d.id, `/${m.id}`), d.token, { venue: 'Main hall' })
		expect(res.status).toBe(409)
		expect((await json(res)).error.code).toBe('drive_started')
	})

	it('another facility cannot read or change it', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		const other = await verifiedFacility(t, { name: 'Other Hospital', licenseNumber: 'LIC-2' })
		const tok = other.owner.body.accessToken
		expect((await call(t, 'GET', dv(other.id, `/${m.id}`), tok)).status).toBe(404)
		expect((await call(t, 'POST', dv(other.id, `/${m.id}/cancel`), tok)).status).toBe(404)
	})
})
