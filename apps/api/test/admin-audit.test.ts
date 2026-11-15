import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { writeAudit } from '@damu/db'
import { admin, auth, json, makeTestApp, resetAccounts, signup } from './helpers'
import { desk } from './request-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const get = (token: string, qs = '') => t.app.request(`/api/admin/audit${qs}`, { headers: auth(token) })
const at = (n: number) => new Date(Date.UTC(2030, 10, 1, 8, 0, 0) + n * 60_000)
const log = (actorId: string | null, action: string, target: string | null, detail: string | null, n: number) => writeAudit(t.db, { actorId, action, target, detail }, at(n))

describe('the audit viewer', () => {
	it('shows newest first, 25 a page, with the total, and names the actor with their facility', async () => {
		const a = await admin(t)
		const d = await desk(t)
		const before = ((await t.pool.query('select count(*) n from audit_log')) as any)[0][0].n
		for (let i = 0; i < 30; i++) await log(a.body.user.id, 'setting.change', 'drives.max_open', '10 to 11', i)
		await log(d.attendant.body.user.id, 'call.publish', null, 'REQ-0044', 100)
		const res = await json(await get(a.body.accessToken))
		expect(res).toMatchObject({ total: Number(before) + 31, page: 1, pageSize: 25 })
		expect(res.items).toHaveLength(25)
		expect(res.items[0]).toMatchObject({ action: 'call.publish', label: 'Published call', who: expect.stringContaining(d.attendant.body.user.name) })
		expect(res.items[0].who).toMatch(/\(.+\)$/)
		expect(res.items[1].who).toBe(a.body.user.name)
		expect((await json(await get(a.body.accessToken, '?page=2'))).items).toHaveLength(Number(before) + 6)
	})
	it('a missing actor reads as System, and an unknown action falls back to the raw action', async () => {
		const a = await admin(t)
		await log(null, 'user.flag', null, 'something', 1)
		await log(a.body.user.id, 'brand.new_action', null, null, 2)
		const items = (await json(await get(a.body.accessToken))).items
		expect(items.find((i: any) => i.action === 'user.flag').who).toBe('System')
		expect(items.find((i: any) => i.action === 'brand.new_action').label).toBe('brand.new_action')
	})
	it('filters by the chips, and every action still shows under All', async () => {
		const a = await admin(t)
		for (const [i, act] of ['facility_approve', 'request.reject', 'call.publish', 'drive.publish', 'record.correct', 'call.edit', 'setting.change', 'admin.add', 'visit.record'].entries()) await log(a.body.user.id, act, null, null, i)
		const ids = async (g: string) => (await json(await get(a.body.accessToken, `?group=${g}`))).items.map((x: any) => x.action).sort()
		expect(await ids('approvals')).toEqual(['facility_approve', 'request.reject'])
		expect(await ids('publications')).toEqual(['call.publish', 'drive.publish'])
		expect(await ids('edits')).toEqual(['call.edit', 'record.correct'])
		expect(await ids('settings')).toEqual(['admin.add', 'setting.change'])
		expect((await ids('all')).length).toBe(9)
		expect((await ids('nonsense')).length).toBe(9)
	})
	it('searches the action, the detail and the actor name', async () => {
		const a = await admin(t)
		await log(a.body.user.id, 'call.publish', null, 'REQ-0044', 1)
		await log(a.body.user.id, 'drive.close', null, 'Greenfield school', 2)
		const q = async (s: string) => (await json(await get(a.body.accessToken, `?q=${encodeURIComponent(s)}`))).items.map((x: any) => x.action)
		expect(await q('req-0044')).toEqual(['call.publish'])
		expect(await q('greenfield')).toEqual(['drive.close'])
		expect(await q('drive.')).toEqual(['drive.close'])
		expect((await q(a.body.user.name.split(' ')[0])).length).toBe(2)
		expect(await q('zzzz')).toEqual([])
	})
	it('masks phone numbers and shows setting names, never raw ids', async () => {
		const a = await admin(t)
		await log(a.body.user.id, 'donor_request.schedule', null, 'texted +254712345678 about it', 1)
		await log(a.body.user.id, 'setting.change', 'alert_limits.weeklyCap', '2 to 3', 2)
		const items = (await json(await get(a.body.accessToken))).items
		expect(items.find((i: any) => i.action === 'donor_request.schedule').detail).not.toContain('712345678')
		expect(items.find((i: any) => i.action === 'setting.change').detail).toBe('Weekly alert cap: 2 to 3')
	})
	it('is for super admins only and has no write endpoint', async () => {
		const s = await signup(t)
		expect((await get(s.body.accessToken)).status).toBe(403)
		const a = await admin(t)
		expect((await t.app.request('/api/admin/audit', { method: 'POST', headers: auth(a.body.accessToken) })).status).toBe(404)
	})
})
