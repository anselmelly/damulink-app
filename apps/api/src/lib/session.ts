import { createHash, randomBytes } from 'node:crypto'
import { insertRefresh, type Db } from '@damu/db'
import { newId } from './id'
import { signAccess } from './jwt'

export const ACCESS_TTL_MS = 15 * 60 * 1000
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** A new access token and a new refresh token (opaque, stored hashed). `familyId` keeps a rotation chain together. */
export async function issueSession(db: Db, secret: string, user: { id: string; tokenVersion: number }, now: Date, opts: { familyId?: string; userAgent?: string | null } = {}) {
	const iat = Math.floor(now.getTime() / 1000)
	const accessToken = signAccess({ sub: user.id, tv: user.tokenVersion, iat, exp: iat + ACCESS_TTL_MS / 1000 }, secret)
	const refreshToken = randomBytes(32).toString('base64url')
	await insertRefresh(db, {
		id: newId(),
		userId: user.id,
		familyId: opts.familyId ?? newId(),
		tokenHash: sha256(refreshToken),
		expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
		createdAt: now,
		userAgent: opts.userAgent?.slice(0, 255) ?? null,
	})
	return { accessToken, refreshToken }
}
