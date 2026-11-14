import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { setSetting } from '@damu/db'
import { auth, emailToken, get, json, makeTestApp, post, resetAccounts, signup } from './helpers'

const t = makeTestApp() // clock 2026-11-14T08:00Z
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const read = async (token: string) => json(await get(t, '/api/me/alerts', auth(token)))
const save = (token: string, over: Record<string, unknown> = {}) =>
	t.app.request('/api/me/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ smsAlerts: true, emailAlerts: false, available: true, pause: 'keep', weeklyCap: 3, quietFrom: 21, quietTo: 7, ...over }) })

describe('GET /api/me/alerts', () => {
	it('needs a session', async () => {
		expect((await get(t, '/api/me/alerts')).status).toBe(401)
	})
	it('before anything is saved: SMS follows the sign-up choice, email is off, available, the system limits', async () => {
		const on = await signup(t, { smsOptIn: true })
		const off = await signup(t, { smsOptIn: false })
		expect(await read(on.body.accessToken)).toMatchObject({ smsAlerts: true, emailAlerts: false, available: true, pausedUntil: null, weeklyCap: 3, quietFrom: 21, quietTo: 7, defaults: { weeklyCap: 3, quietFrom: 21, quietTo: 7 } })
		expect((await read(off.body.accessToken)).smsAlerts).toBe(false)
	})
})

describe('PUT /api/me/alerts', () => {
	it('saves and reads back the choices', async () => {
		const { body } = await signup(t)
		const res = await save(body.accessToken, { smsAlerts: false, available: false, weeklyCap: 2, quietFrom: 20, quietTo: 8 })
		expect(res.status).toBe(200)
		expect(await read(body.accessToken)).toMatchObject({ smsAlerts: false, available: false, weeklyCap: 2, quietFrom: 20, quietTo: 8 })
	})
	it('limits can only be stricter than the system defaults: a higher cap, later start or earlier end is 422', async () => {
		const { body } = await signup(t)
		for (const bad of [{ weeklyCap: 4 }, { quietFrom: 22 }, { quietTo: 6 }]) {
			const res = await save(body.accessToken, bad)
			expect(res.status).toBe(422)
		}
	})
	it('follows the defaults the super admin sets in the settings table', async () => {
		await setSetting(t.db, 'alert_limits', { weeklyCap: 5, quietFrom: 22, quietTo: 6 }, t.clock.now())
		const { body } = await signup(t)
		expect((await save(body.accessToken, { weeklyCap: 5, quietFrom: 22, quietTo: 6 })).status).toBe(200)
		expect((await save(body.accessToken, { weeklyCap: 6 })).status).toBe(422)
	})
	it('email alerts need a verified email (422), and work once it is', async () => {
		const { body } = await signup(t)
		const refused = await save(body.accessToken, { emailAlerts: true })
		expect(refused.status).toBe(422)
		expect((await json(refused)).error.code).toBe('email_not_verified')
		await post(t, '/api/auth/verify-email', { token: emailToken(t) })
		expect((await save(body.accessToken, { emailAlerts: true })).status).toBe(200)
		expect((await read(body.accessToken)).emailAlerts).toBe(true)
	})
	it('pause: sets a date from today, keep leaves it, none clears it', async () => {
		const { body } = await signup(t)
		await save(body.accessToken, { pause: '2w' })
		expect((await read(body.accessToken)).pausedUntil).toBe('2026-11-28T08:00:00.000Z')
		await save(body.accessToken, { pause: 'keep', weeklyCap: 2 })
		expect((await read(body.accessToken)).pausedUntil).toBe('2026-11-28T08:00:00.000Z')
		await save(body.accessToken, { pause: 'none' })
		expect((await read(body.accessToken)).pausedUntil).toBeNull()
		await save(body.accessToken, { pause: '1m' })
		expect((await read(body.accessToken)).pausedUntil).toBe('2026-12-14T08:00:00.000Z')
	})
	it('an unknown pause or a cap of 0 is 422', async () => {
		const { body } = await signup(t)
		expect((await save(body.accessToken, { pause: 'forever' })).status).toBe(422)
		expect((await save(body.accessToken, { weeklyCap: 0 })).status).toBe(422)
	})
})
