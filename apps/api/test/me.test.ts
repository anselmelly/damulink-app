import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@damu/db'
import { eq } from 'drizzle-orm'
import { auth, get, json, makeTestApp, resetAccounts, signup } from './helpers'
import { sign } from 'hono/jwt'
import { TEST_SECRET } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('GET /api/me', () => {
	it('is 401 without X-Auth, and does not read the Authorization header', async () => {
		const { body } = await signup(t)
		expect((await get(t, '/api/me')).status).toBe(401)
		expect((await get(t, '/api/me', { Authorization: `Bearer ${body.accessToken}` })).status).toBe(401)
	})
	it('returns the user with a masked phone and honest flags', async () => {
		const { body, input } = await signup(t, { phone: '0712345678' })
		const me = await json(await get(t, '/api/me', auth(body.accessToken)))
		expect(me).toMatchObject({ email: input.email, phone: '+254 7•• ••• 678', emailVerified: false, phoneVerified: false, isSuperAdmin: false, canDonate: true })
		expect(JSON.stringify(me)).not.toContain('712345678')
	})
	it('a suspended user is cut off on the next call (403)', async () => {
		const { body, input } = await signup(t)
		await t.db.update(users).set({ status: 'suspended' }).where(eq(users.email, input.email))
		expect((await get(t, '/api/me', auth(body.accessToken))).status).toBe(403)
	})
	it('rejects a token signed with another secret, another algorithm, or a garbage string', async () => {
		const { body } = await signup(t)
		const [u] = await t.db.select().from(users)
		const claims = { sub: u.id, tv: 0, iat: 1, exp: 4102444800 }
		expect((await get(t, '/api/me', auth(await sign(claims, 'another-secret-another-secret-123456')))).status).toBe(401)
		expect((await get(t, '/api/me', auth(await sign(claims, TEST_SECRET, 'HS512')))).status).toBe(401)
		expect((await get(t, '/api/me', auth('garbage'))).status).toBe(401)
		expect(body.accessToken).toBeTruthy()
	})
})
