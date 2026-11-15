import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { auth, json, makeTestApp, resetAccounts } from './helpers'
import { donor, near } from './alert-helpers'
import { live, respond } from './call-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
})
afterAll(() => t.pool.end())
const list = (token: string) => t.app.request('/api/donor/calls', { headers: auth(token) })
const accept = (token: string, code: string) => t.app.request(`/api/donor/calls/${code}/accept`, { method: 'POST', headers: auth(token) })
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]

describe('calls for a donor', () => {
	it('lists live calls that fit the blood type and the donor\'s places, with no patient data', async () => {
		const c = await live(t)
		const d = await donor(t, c.id)
		const res = await json(await list(d.body.accessToken))
		expect(res.state).toBe('ok')
		expect(res.items).toHaveLength(1)
		expect(res.items[0]).toMatchObject({ code: c.c.number, bloodType: 'A+', accepted: false, where: 'Your facility', stillNeeded: 2 })
		expect(JSON.stringify(res)).not.toMatch(/Test Patient|Ward \d|requestId/)
	})
	it('hides other blood types, far facilities, and calls already covered', async () => {
		const c = await live(t)
		const far = await donor(t, (await near(t, 5, 'Turkana')).id)
		expect((await json(await list(far.body.accessToken))).items).toHaveLength(0)
		const other = await donor(t, c.id, { facts: { blood_type: 'B+' } })
		expect((await json(await list(other.body.accessToken))).items).toHaveLength(0)
		const mine = await donor(t, c.id)
		await respond(t, c.c.id, { status: 'scheduled' })
		await respond(t, c.c.id, { status: 'scheduled' })
		expect((await json(await list(mine.body.accessToken))).items).toHaveLength(0)
	})
	it('a donor still sees a call they said yes to, marked accepted', async () => {
		const c = await live(t)
		const d = await donor(t, c.id)
		expect((await accept(d.body.accessToken, c.c.number)).status).toBe(200)
		expect((await json(await list(d.body.accessToken))).items[0].accepted).toBe(true)
	})
	it('says unverified without a recorded blood type, and waiting with the date inside the waiting period', async () => {
		const c = await live(t)
		const u = await donor(t, c.id, { facts: { blood_type: null } })
		expect(await json(await list(u.body.accessToken))).toMatchObject({ state: 'unverified', items: [] })
		const w = await donor(t, c.id, { facts: { last_donation_on: '2026-10-20' } })
		const res = await json(await list(w.body.accessToken))
		expect(res.state).toBe('waiting')
		expect(res.nextEligibleOn).toBe('2027-02-20')
		expect(res.items).toHaveLength(1)
	})
	it('refuses under 18 and signed-out', async () => {
		const c = await live(t)
		const kid = await donor(t, c.id, { signup: { dateOfBirth: '2015-01-01' } })
		expect((await list(kid.body.accessToken)).status).toBe(403)
		expect((await t.app.request('/api/donor/calls')).status).toBe(401)
	})
})

describe('saying yes in the app', () => {
	it('writes a willing response with the ring, the facility sees it, and a second tap changes nothing', async () => {
		const c = await live(t)
		const d = await donor(t, c.id)
		expect((await accept(d.body.accessToken, c.c.number)).status).toBe(200)
		expect((await accept(d.body.accessToken, c.c.short)).status).toBe(200)
		const r = await rows('select status, ring, user_id from call_responses where call_id = ?', [c.c.id])
		expect(r).toEqual([{ status: 'willing', ring: 1, user_id: d.id }])
		const detail = await json(await t.app.request(`/api/my-facilities/${c.id}/calls/${c.c.id}`, { headers: auth(c.adminToken) }))
		expect(JSON.stringify(detail)).toContain(d.body.user.name)
	})
	it('409 covered when scheduled units already cover the call, 409 closed, 409 not_eligible with the date, 404 when it does not fit', async () => {
		const c = await live(t)
		const d = await donor(t, c.id)
		const w = await donor(t, c.id, { facts: { last_donation_on: '2026-10-20' } })
		const o = await donor(t, c.id, { facts: { blood_type: 'B+' } })
		expect(await json(await accept(w.body.accessToken, c.c.number))).toMatchObject({ error: { code: 'not_eligible', fields: { eligibleOn: '2027-02-20' } } })
		expect((await accept(o.body.accessToken, c.c.number)).status).toBe(404)
		expect((await accept(d.body.accessToken, 'CALL-9999')).status).toBe(404)
		await respond(t, c.c.id, { status: 'scheduled' })
		await respond(t, c.c.id, { status: 'scheduled' })
		expect(await json(await accept(d.body.accessToken, c.c.number))).toMatchObject({ error: { code: 'covered' } })
		await t.pool.query(`update calls set status = 'closed' where id = ?`, [c.c.id])
		expect(await json(await accept(d.body.accessToken, c.c.number))).toMatchObject({ error: { code: 'closed' } })
		expect(await rows('select 1 from call_responses where user_id = ?', [d.id])).toHaveLength(0)
	})
	it('refuses signed-out and unverified donors', async () => {
		const c = await live(t)
		expect((await t.app.request(`/api/donor/calls/${c.c.number}/accept`, { method: 'POST' })).status).toBe(401)
		const u = await donor(t, c.id, { facts: { blood_type: null } })
		expect((await accept(u.body.accessToken, c.c.number)).status).toBe(403)
	})
})
