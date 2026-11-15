import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { checkinDesk, donor, verifiedDonor } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const url = (id: string, qs = '') => `/api/my-facilities/${id}/donors${qs}`
const home = (d: Awaited<ReturnType<typeof checkinDesk>>, userId: string) => t.pool.query(`update users set home_facility_id = ? where id = ?`, [d.id, userId])

describe('the donors list (admins)', () => {
	it('lists home-facility donors only, with counts that match', async () => {
		const d = await checkinDesk(t)
		const a = await verifiedDonor(t, { last_donation_on: '2026-10-20' })
		const b = await donor(t, {}, { name: 'Samuel Kiprop', sex: 'male' })
		await verifiedDonor(t, {}, { name: 'Elsewhere Person' })
		await home(d, a.id)
		await home(d, b.id)
		const r = await json(await call(t, 'GET', url(d.id), d.adminToken))
		expect(r.items.map((x: any) => x.name).sort()).toEqual(['Faith Wambui', 'Samuel Kiprop'])
		expect(r.counts).toEqual({ all: 2, verified: 1, registered: 1, alertsOn: 2 })
		const f = r.items.find((x: any) => x.name === 'Faith Wambui')
		expect(f).toMatchObject({ code: a.code, bloodType: 'O-', verified: true, lastDonationOn: '2026-10-20', alertsOn: true, suspended: false })
		expect(f.eligibility).toMatch(/20 February 2027/)
		expect(r.items.find((x: any) => x.name === 'Samuel Kiprop').eligibility).toBe('First visit')
	})

	it('search by name or code, filters by status and blood type', async () => {
		const d = await checkinDesk(t)
		const a = await verifiedDonor(t, { blood_type: 'O-' })
		const b = await verifiedDonor(t, { blood_type: 'A+' }, { name: 'Joyce Njoki' })
		const c = await donor(t, {}, { name: 'Samuel Kiprop' })
		for (const x of [a, b, c]) await home(d, x.id)
		const names = async (qs: string) => (await json(await call(t, 'GET', url(d.id, qs), d.adminToken))).items.map((x: any) => x.name).sort()
		expect(await names('?q=joyce')).toEqual(['Joyce Njoki'])
		expect(await names(`?q=${b.code.slice(3, 7)}`)).toEqual(['Joyce Njoki'])
		expect(await names('?status=registered')).toEqual(['Samuel Kiprop'])
		expect(await names('?status=verified')).toEqual(['Faith Wambui', 'Joyce Njoki'])
		expect(await names('?bloodType=A%2B')).toEqual(['Joyce Njoki'])
	})

	it('25 a page', async () => {
		const d = await checkinDesk(t)
		for (let i = 0; i < 27; i++) await home(d, (await donor(t, {}, { name: `Donor ${String(i).padStart(2, '0')}` })).id)
		const p1 = await json(await call(t, 'GET', url(d.id), d.adminToken))
		const p2 = await json(await call(t, 'GET', url(d.id, '?page=2'), d.adminToken))
		expect([p1.items.length, p2.items.length, p1.total, p1.pageSize]).toEqual([25, 2, 27, 25])
	})

	it('attendants get 403; donors and strangers 404', async () => {
		const d = await checkinDesk(t)
		const o = await checkinDesk(t)
		expect((await call(t, 'GET', url(d.id), d.token)).status).toBe(403)
		expect((await call(t, 'GET', url(d.id), d.who.body.accessToken)).status).toBe(404)
		expect((await call(t, 'GET', url(d.id), o.adminToken)).status).toBe(404)
	})

	it('no phone, email or date of birth; suspended are marked; each view is audited without rows', async () => {
		const d = await checkinDesk(t)
		const a = await verifiedDonor(t)
		const b = await verifiedDonor(t, {}, { name: 'Mercy Wangari' })
		await home(d, a.id)
		await home(d, b.id)
		await t.pool.query(`update users set status = 'suspended' where id = ?`, [b.id])
		const text = await (await call(t, 'GET', url(d.id, '?q=a'), d.adminToken)).text()
		for (const bad of [a.input.email, a.input.phone, '1995-05-10', 'phone', 'email', 'dateOfBirth']) expect(text).not.toContain(bad)
		expect(JSON.parse(text).items.find((x: any) => x.name === 'Mercy Wangari').suspended).toBe(true)
		const [rows]: any = await t.pool.query(`select detail from audit_log where action = 'donors.view'`)
		expect(rows).toHaveLength(1)
		expect(JSON.stringify(rows)).not.toContain('Faith')
	})

	it('is rate limited', async () => {
		const d = await checkinDesk(t)
		for (let i = 0; i < 60; i++) await call(t, 'GET', url(d.id), d.adminToken)
		expect((await call(t, 'GET', url(d.id), d.adminToken)).status).toBe(429)
	})
})
