import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { json, login, makeTestApp, resetAccounts, signup, verifiedFacility, post, auth, decideAs } from './helpers'
import { donor as nearDonor, near, prefs, tick } from './alert-helpers'
import { call } from './request-helpers'
import { driveDesk, dv, made, publishDrive } from './drive-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())

const texts = () => t.sms.sent.filter((m) => /Blood drive at/.test(m.text))

describe('publishing a drive', () => {
	it('needs a public page, SMS, or both', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		const res = await publishDrive(t, d, m.id, { isPublic: false, smsEnabled: false })
		expect(res.status).toBe(422)
		expect((await publishDrive(t, d, m.id, { isPublic: true, smsEnabled: false })).status).toBe(200)
		expect((await json(await call(t, 'GET', dv(d.id, `/${m.id}`), d.token))).status).toBe('published')
	})

	it('a published drive cannot be published again', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		await publishDrive(t, d, m.id)
		expect((await publishDrive(t, d, m.id)).status).toBe(409)
	})

	it('the preview counts the donors who would be told, and names no one', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		const a = await nearDonor(t, d.id, { signup: { name: 'Zed Zeta' } })
		await nearDonor(t, d.id)
		const far = await near(t, 0.045, 'Siaya')
		await nearDonor(t, far.id)
		const res = await call(t, 'GET', dv(d.id, `/${m.id}/publish`), d.token)
		const b = await json(res)
		expect(b.audience).toEqual({ total: 3, ring1: 2, ring2: 1, ring3: 0 })
		expect(b.sms.text).toContain('Blood drive at Greenfield Secondary School')
		expect(JSON.stringify(b)).not.toContain(a.id)
		expect(JSON.stringify(b)).not.toContain('Zed')
	})

	it('texts each nearby donor once, with the host, town, day, time and link, and no contact or YES', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		const p = await nearDonor(t, d.id)
		const res = await publishDrive(t, d, m.id, { isPublic: true, smsEnabled: true })
		expect(res.status).toBe(200)
		expect(texts().map((x) => x.to)).toEqual([p.e164])
		const text = texts()[0].text
		expect(text).toContain('Sat 21 Nov')
		expect(text).toContain('9:00-15:00')
		expect(text).toMatch(new RegExp(`/d/${m.short}`))
		for (const secret of ['Otieno', '0712345678', 'YES']) expect(text).not.toContain(secret)
		await tick(t)
		expect(texts()).toHaveLength(1) // a later pass never tells the same donor twice
		const [rows] = (await t.pool.query(`select status from drive_alerts`)) as any
		expect(rows).toEqual([{ status: 'sent' }])
	})

	it('any blood type is told', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		await nearDonor(t, d.id, { facts: { blood_type: 'AB-' } })
		await nearDonor(t, d.id, { facts: { blood_type: 'O+' } })
		await publishDrive(t, d, m.id, { isPublic: false, smsEnabled: true })
		expect(texts()).toHaveLength(2)
	})

	it('leaves out donors who are still waiting on the drive day, or opted out', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		await nearDonor(t, d.id, { facts: { last_donation_on: '2026-10-20' } }) // eligible only from 20 Feb 2027
		const out = await nearDonor(t, d.id)
		await prefs(t, out.id, { smsAlerts: false })
		const ok = await nearDonor(t, d.id)
		await publishDrive(t, d, m.id, { isPublic: true, smsEnabled: true })
		expect(texts().map((x) => x.to)).toEqual([ok.e164])
	})

	it('a donor in the waiting period now but free by the drive day is told', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d, { date: '2027-03-06' })
		const p = await nearDonor(t, d.id, { facts: { last_donation_on: '2026-11-01' } }) // eligible from 1 Mar 2027
		await publishDrive(t, d, m.id, { isPublic: true, smsEnabled: true })
		expect(texts().map((x) => x.to)).toEqual([p.e164])
	})

	it('a public-only drive sends nothing', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		await nearDonor(t, d.id)
		await publishDrive(t, d, m.id, { isPublic: true, smsEnabled: false })
		expect(texts()).toHaveLength(0)
	})

	it('night-time donors get it in the morning', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		clock.set('2026-11-14T20:30:00Z') // 23:30 Nairobi: quiet hours
		const p = await nearDonor(t, d.id)
		const token = (await json(await login(t, d.attendant.input.email, d.attendant.input.password))).accessToken // the old access token has expired
		await publishDrive(t, { id: d.id, token }, m.id, { isPublic: true, smsEnabled: true })
		expect(texts()).toHaveLength(0)
		clock.set('2026-11-15T05:00:00Z') // 08:00 Nairobi
		await tick(t)
		expect(texts().map((x) => x.to)).toEqual([p.e164])
	})

	it('suspending the facility takes its drives down', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		await publishDrive(t, d, m.id)
		const res = await post(t, `/api/admin/facilities/${d.id}/decision`, { action: 'suspend', how: 'test' }, auth(d.ad.body.accessToken))
		expect(res.status).toBe(200)
		const [rows] = (await t.pool.query(`select status from drives`)) as any
		expect(rows).toEqual([{ status: 'taken_down' }])
	})
})
