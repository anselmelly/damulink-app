import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, makeTestApp, resetAccounts, signup } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const read = async (token: string) => json(await get(t, '/api/me/reminders', auth(token)))
const save = (token: string, over: Record<string, unknown> = {}) =>
	t.app.request('/api/me/reminders', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ cycle: 'on_day', daysBefore: 3, cycleMonths: null, appointmentReminders: true, ...over }) })

describe('reminders', () => {
	it('need a session', async () => {
		expect((await get(t, '/api/me/reminders')).status).toBe(401)
	})
	it('start as: on the day I can donate, 3 days before if chosen, appointment reminders on; shortest cycle follows the waiting period', async () => {
		const f = await signup(t, { sex: 'female' })
		const m = await signup(t, { sex: 'male' })
		expect(await read(f.body.accessToken)).toMatchObject({ cycle: 'on_day', daysBefore: 3, appointmentReminders: true, minMonths: 4 })
		expect((await read(m.body.accessToken)).minMonths).toBe(3)
	})
	it('saves each choice', async () => {
		const { body } = await signup(t)
		expect((await save(body.accessToken, { cycle: 'days_before', daysBefore: 7 })).status).toBe(200)
		expect(await read(body.accessToken)).toMatchObject({ cycle: 'days_before', daysBefore: 7 })
		expect((await save(body.accessToken, { cycle: 'custom', cycleMonths: 6 })).status).toBe(200)
		expect(await read(body.accessToken)).toMatchObject({ cycle: 'custom', cycleMonths: 6 })
		expect((await save(body.accessToken, { cycle: 'off', appointmentReminders: false })).status).toBe(200)
		expect(await read(body.accessToken)).toMatchObject({ cycle: 'off', appointmentReminders: false })
	})
	it('a custom cycle needs months, and never shorter than the waiting period', async () => {
		const { body } = await signup(t, { sex: 'female' }) // 4 months
		expect((await save(body.accessToken, { cycle: 'custom', cycleMonths: null })).status).toBe(422)
		const short = await save(body.accessToken, { cycle: 'custom', cycleMonths: 3 })
		expect(short.status).toBe(422)
		expect((await json(short)).error.fields.cycleMonths).toBeTruthy()
		expect((await save(body.accessToken, { cycle: 'custom', cycleMonths: 4 })).status).toBe(200)
	})
	it('days before must be 1, 3, 5 or 7', async () => {
		const { body } = await signup(t)
		expect((await save(body.accessToken, { cycle: 'days_before', daysBefore: 2 })).status).toBe(422)
	})
})
