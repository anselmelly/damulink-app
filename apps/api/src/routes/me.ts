import { Hono } from 'hono'
import { findUserById, hit, peek, reset, revokeAllForUser, setPassword } from '@damu/db'
import { changePasswordInput } from '@damu/shared-types'
import { ApiError } from '../lib/errors'
import { hashPassword, verifyPassword } from '../lib/password'
import { issueSession } from '../lib/session'
import { parseInput, readJson } from '../lib/validate'
import { toMe } from '../lib/me'
import { requireAuth, type AuthEnv } from '../middleware/auth'

export const meRoutes = new Hono<AuthEnv>()
meRoutes.use('*', requireAuth)

meRoutes.get('/', async (c) => c.json(await toMe(c.var.db, c.var.user, !!c.var.user.donorCode)))

/** Change the password while signed in. Every old session dies; the answer carries a fresh pair for this one. */
meRoutes.post('/password', async (c) => {
	const { db, clock, config, user } = c.var
	const { currentPassword, newPassword } = parseInput(changePasswordInput, await readJson(c))
	const now = clock.now()
	const key = `pwchange:${user.id}`
	if ((await peek(db, key, 15 * 60 * 1000, now)) >= 5) throw new ApiError(429, 'too_many_attempts', 'Too many attempts. Try again in a few minutes.')
	if (!(await verifyPassword(currentPassword, user.passwordHash))) {
		await hit(db, key, 15 * 60 * 1000, now)
		throw new ApiError(403, 'wrong_password', 'Your current password is not right.', { currentPassword: 'Not right' })
	}
	await reset(db, key)
	await setPassword(db, user.id, await hashPassword(newPassword, config.pbkdf2Iterations))
	await revokeAllForUser(db, user.id, now)
	const fresh = (await findUserById(db, user.id))!
	return c.json(await issueSession(db, config.jwtSecret, fresh, now, { userAgent: c.req.header('User-Agent') }))
})
