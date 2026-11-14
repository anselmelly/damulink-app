import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@damu/db'
import { eq } from 'drizzle-orm'
import { json, login, makeTestApp, resetAccounts, signup } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('POST /api/auth/login', () => {
	it('returns tokens and the user', async () => {
		const { input } = await signup(t)
		const res = await login(t, input.email, input.password)
		expect(res.status).toBe(200)
		const body = await json(res)
		expect(body.accessToken).toBeTruthy()
		expect(body.user.email).toBe(input.email)
	})
	it('a wrong password and an unknown email give the same answer (401, same body)', async () => {
		const { input } = await signup(t)
		const a = await login(t, input.email, 'wrong-password')
		const b = await login(t, 'nobody@example.com', 'wrong-password')
		expect(a.status).toBe(401)
		expect(b.status).toBe(401)
		expect(await json(a)).toEqual(await json(b))
	})
	it('matches the email case-insensitively', async () => {
		const { input } = await signup(t)
		expect((await login(t, input.email.toUpperCase(), input.password)).status).toBe(200)
	})
	it('a suspended user is refused with 403', async () => {
		const { input } = await signup(t)
		await t.db.update(users).set({ status: 'suspended' }).where(eq(users.email, input.email))
		expect((await login(t, input.email, input.password)).status).toBe(403)
	})
	it('sets last_login_at from the clock', async () => {
		const { input } = await signup(t)
		await login(t, input.email, input.password)
		const [u] = await t.db.select().from(users)
		expect(u.lastLoginAt?.toISOString()).toBe('2026-11-14T08:00:00.000Z')
	})
	it('five failures in 15 minutes lock login (429) even for the right password; success before that resets the count', async () => {
		const { input } = await signup(t)
		for (let i = 0; i < 4; i++) await login(t, input.email, 'bad-password')
		expect((await login(t, input.email, input.password)).status).toBe(200) // success resets
		for (let i = 0; i < 5; i++) expect((await login(t, input.email, 'bad-password')).status).toBe(401)
		const locked = await login(t, input.email, input.password)
		expect(locked.status).toBe(429)
		t.clock.advance(16 * 60 * 1000)
		expect((await login(t, input.email, input.password)).status).toBe(200)
	})
	it('malformed input is 422', async () => {
		const res = await login(t, 'not-an-email', '')
		expect(res.status).toBe(422)
	})
})
