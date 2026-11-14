import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@damu/db'
import { eq } from 'drizzle-orm'
import { auth, get, json, makeTestApp, post, resetAccounts, signup } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const regen = (token?: string) => post(t, '/api/me/donor-code/regenerate', {}, token ? auth(token) : {})

describe('new donor code', () => {
	it('needs a session', async () => {
		expect((await regen()).status).toBe(401)
	})
	it('makes a different code in the same format; /me shows it; the old one stops existing', async () => {
		const { body } = await signup(t)
		const old = body.user.donorCode
		const res = await regen(body.accessToken)
		expect(res.status).toBe(200)
		const { donorCode } = await json(res)
		expect(donorCode).toMatch(/^DL-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{2}$/)
		expect(donorCode).not.toBe(old)
		expect((await json(await get(t, '/api/me', auth(body.accessToken)))).donorCode).toBe(donorCode)
		expect(await t.db.select().from(users).where(eq(users.donorCode, old))).toHaveLength(0)
	})
	it('someone under 18 has no code to replace (403)', async () => {
		const { body } = await signup(t, { dateOfBirth: '2010-03-05' })
		const res = await regen(body.accessToken)
		expect(res.status).toBe(403)
		expect((await json(res)).error.code).toBe('not_a_donor')
	})
	it('at most 3 new codes a day', async () => {
		const { body } = await signup(t)
		for (let i = 0; i < 3; i++) expect((await regen(body.accessToken)).status).toBe(200)
		expect((await regen(body.accessToken)).status).toBe(429)
	})
})
