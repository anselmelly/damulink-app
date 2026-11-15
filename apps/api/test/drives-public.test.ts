import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { get, json, makeTestApp, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { donor } from './checkin-helpers'
import { driveDesk, dv, made, publishDrive } from './drive-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
})
afterAll(() => t.pool.end())

const list = async (q = '') => (await json(await get(t, `/api/public/drives${q}`))).items as any[]
const live = async (d: Awaited<ReturnType<typeof driveDesk>>, over: Record<string, unknown> = {}, body: Record<string, unknown> = { isPublic: true, smsEnabled: false }) => {
	const m = await made(t, d, over)
	await publishDrive(t, d, m.id, body)
	return m
}

describe('the public drive list', () => {
	it('shows published public drives, soonest first, and nothing else', async () => {
		const d = await driveDesk(t)
		const later = await live(d, { date: '2026-11-28', host: 'Later School' })
		const sooner = await live(d, { date: '2026-11-21', host: 'Sooner School' })
		await made(t, d, { host: 'Draft School' })
		await live(d, { host: 'Sms Only School' }, { isPublic: false, smsEnabled: true })
		const gone = await live(d, { host: 'Cancelled School' })
		await call(t, 'POST', dv(d.id, `/${gone.id}/cancel`), d.token)
		expect((await list()).map((x) => x.host)).toEqual(['Sooner School', 'Later School'])
		expect((await list())[0].code).toBe('DRIVE-0002')
		expect(later.short).toBeTruthy()
		expect(sooner.short).toBeTruthy()
	})

	it('filters by town, ignoring case', async () => {
		const d = await driveDesk(t)
		await live(d, { town: 'Nakuru', host: 'A School' })
		await live(d, { town: 'Eldoret', host: 'B School' })
		expect((await list('?town=eldoret')).map((x) => x.host)).toEqual(['B School'])
	})

	it("today's drive stays until its end time", async () => {
		const d = await driveDesk(t)
		await live(d, { date: '2026-11-14', starts: '11:30', ends: '12:30' })
		expect(await list()).toHaveLength(1)
		clock.set('2026-11-14T09:45:00Z') // 12:45 Nairobi
		expect(await list()).toHaveLength(0)
	})

	it('never carries the host contact, the facility id or anyone who is interested', async () => {
		const d = await driveDesk(t)
		const m = await live(d)
		await t.app.request(`/api/public/drives/${m.code}/interest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Wanjiku Kamau', phone: '0711222333' }) })
		const text = JSON.stringify([await list(), await json(await get(t, `/api/public/drives/${m.code}`))])
		for (const secret of ['Otieno', '254712345678', 'Wanjiku', '254711222333', d.id]) expect(text).not.toContain(secret)
	})
})

describe('a drive page', () => {
	it('resolves by code and by short code, with the facility and the link', async () => {
		const d = await driveDesk(t)
		const m = await live(d)
		const a = await json(await get(t, `/api/public/drives/${m.code}`))
		expect(a).toMatchObject({ code: 'DRIVE-0001', host: 'Greenfield Secondary School', venue: 'School hall', state: 'open', interested: false })
		expect(a.link).toBe(`http://localhost:5173/d/${m.short}`)
		expect(a.facility.name).toBeTruthy()
		expect((await json(await get(t, `/api/public/drives/by-short/${m.short}`))).code).toBe('DRIVE-0001')
		expect((await json(await get(t, `/api/public/drives/${m.short}`))).code).toBe('DRIVE-0001')
	})

	it('drafts, SMS-only drives and unknown codes are not found', async () => {
		const d = await driveDesk(t)
		const draft = await made(t, d)
		const sms = await live(d, {}, { isPublic: false, smsEnabled: true })
		for (const code of [draft.code, sms.code, 'DRIVE-0099', 'nope']) expect((await get(t, `/api/public/drives/${code}`)).status).toBe(404)
	})

	it('cancelled and ended drives keep a page with their state', async () => {
		const d = await driveDesk(t)
		const m = await live(d, { date: '2026-11-14', starts: '11:30', ends: '12:30' })
		clock.set('2026-11-14T10:00:00Z')
		expect((await json(await get(t, `/api/public/drives/${m.code}`))).state).toBe('ended')
		clock.set('2026-11-14T08:00:00Z')
		const n = await live(d, { date: '2026-11-21' })
		await call(t, 'POST', dv(d.id, `/${n.id}/cancel`), d.token)
		expect((await json(await get(t, `/api/public/drives/${n.code}`))).state).toBe('cancelled')
	})

	it('tells a signed-in donor they are on the list', async () => {
		const d = await driveDesk(t)
		const m = await live(d)
		const p = await donor(t)
		const tok = { 'X-Auth': p.body.accessToken }
		expect((await json(await get(t, `/api/public/drives/${m.code}`, tok))).interested).toBe(false)
		await t.app.request(`/api/public/drives/${m.code}/interest`, { method: 'POST', headers: tok })
		expect((await json(await get(t, `/api/public/drives/${m.code}`, tok))).interested).toBe(true)
		expect((await json(await get(t, `/api/public/drives/${m.code}`, { 'X-Auth': 'junk' }))).interested).toBe(false)
	})
})
