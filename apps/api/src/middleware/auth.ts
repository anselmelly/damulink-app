import { createMiddleware } from 'hono/factory'
import { findUserById, type User } from '@damu/db'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { verifyAccess } from '../lib/jwt'

export type AuthEnv = { Variables: AppEnv['Variables'] & { user: User } }

/** The token travels in X-Auth, never Authorization. Checks signature, expiry, token_version and status on every call. */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
	const token = c.req.header('X-Auth')
	if (!token) throw new ApiError(401, 'unauthenticated', 'Please log in.')
	const claims = verifyAccess(token, c.var.config.jwtSecret)
	if (!claims) throw new ApiError(401, 'invalid_token', 'Please log in again.')
	if (claims.exp * 1000 <= c.var.clock.now().getTime()) throw new ApiError(401, 'token_expired', 'Your session expired.')
	const user = await findUserById(c.var.db, claims.sub)
	if (!user) throw new ApiError(401, 'invalid_token', 'Please log in again.')
	if (user.tokenVersion !== claims.tv) throw new ApiError(401, 'token_revoked', 'Please log in again.')
	if (user.status !== 'active') throw new ApiError(403, 'suspended', 'This account is suspended.')
	c.set('user', user)
	await next()
})
