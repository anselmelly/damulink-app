import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { setSetting } from '@damu/db'
import { fixedClock } from '../src/lib/clock'
import { json, makeTestApp, resetAccounts } from './helpers'
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

const say = (code: string, body?: unknown, headers: Record<string, string> = {}) =>
	t.app.request(`/api/public/drives/${code}/interest`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
const rows = async () => ((await t.pool.query('select name, phone, user_id from drive_interest order by created_at')) as any)[0] as { name: string; phone: string | null; user_id: string | null }[]
async function open() {
	const d = await driveDesk(t)
	const m = await made(t, d)
	await publishDrive(t, d, m.id)
	return { d, m }
}

describe('saying you are interested', () => {
	it('a guest gives a name and an optional phone, and only those are stored', async () => {
		const { m } = await open()
		expect((await say(m.code, { name: 'Wanjiku Kamau', phone: '0711222333', note: 'ignored' })).status).toBe(201)
		expect((await say(m.code, { name: 'Peter Ouma' })).status).toBe(201)
		expect(await rows()).toEqual([
			{ name: 'Wanjiku Kamau', phone: '+254711222333', user_id: null },
			{ name: 'Peter Ouma', phone: null, user_id: null },
		])
		const [cols] = (await t.pool.query(`show columns from drive_interest`)) as any
		expect(cols.map((c: any) => c.Field).sort()).toEqual(['arrived_at', 'created_at', 'drive_id', 'id', 'name', 'phone', 'user_id'])
	})

	it('a signed-in donor taps once, with the name from the account and no phone kept', async () => {
		const { m } = await open()
		const p = await donor(t)
		expect((await say(m.code, undefined, { 'X-Auth': p.body.accessToken })).status).toBe(201)
		expect(await rows()).toEqual([{ name: 'Faith Wambui', phone: null, user_id: p.id }])
	})

	it('is not double counted', async () => {
		const { m } = await open()
		const p = await donor(t)
		await say(m.code, { name: 'Wanjiku Kamau', phone: '0711222333' })
		expect((await say(m.code, { name: 'Another Name', phone: '0711 222 333' })).status).toBe(200)
		await say(m.code, { name: 'No Phone' })
		expect((await say(m.code, { name: 'no phone' })).status).toBe(200)
		await say(m.code, undefined, { 'X-Auth': p.body.accessToken })
		expect((await say(m.code, undefined, { 'X-Auth': p.body.accessToken })).status).toBe(200)
		expect(await rows()).toHaveLength(3)
	})

	it.each([[{}, 'name'], [{ name: 'A' }, 'name'], [{ name: 'Wanjiku Kamau', phone: '12' }, 'phone']])('rejects %j', async (body, field) => {
		const { m } = await open()
		const res = await say(m.code, body)
		expect(res.status).toBe(422)
		expect((await json(res)).error.fields[field]).toBeTruthy()
	})

	it('a bad token is refused, not treated as a guest', async () => {
		const { m } = await open()
		expect((await say(m.code, { name: 'Wanjiku Kamau' }, { 'X-Auth': 'junk' })).status).toBe(401)
	})

	it('closed, cancelled, finished and unpublished drives refuse', async () => {
		const { d, m } = await open()
		const n = await made(t, d, { date: '2026-11-22' })
		await publishDrive(t, d, n.id)
		await call(t, 'POST', dv(d.id, `/${n.id}/cancel`), d.token)
		expect((await say(n.code, { name: 'Wanjiku Kamau' })).status).toBe(409)
		const draft = await made(t, d)
		expect((await say(draft.code, { name: 'Wanjiku Kamau' })).status).toBe(404)
		clock.set('2026-11-22T12:00:00Z')
		expect((await say(m.code, { name: 'Wanjiku Kamau' })).status).toBe(409)
	})

	it('is rate limited per address', async () => {
		await setSetting(t.db, 'drives.interest_per_ip_hour', 2, t.clock.now())
		const { m } = await open()
		await say(m.code, { name: 'Person One' })
		await say(m.code, { name: 'Person Two' })
		expect((await say(m.code, { name: 'Person Three' })).status).toBe(429)
	})
})
