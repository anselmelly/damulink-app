import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { authTokens, phoneOtps, users } from '../schema'

export type AuthToken = typeof authTokens.$inferSelect
export type PhoneOtp = typeof phoneOtps.$inferSelect
type Kind = AuthToken['kind']

/** Issues a link token and cancels any earlier unused one of the same kind for that user. */
export async function createAuthToken(db: Db, t: typeof authTokens.$inferInsert): Promise<void> {
	await db.update(authTokens).set({ usedAt: t.createdAt }).where(and(eq(authTokens.userId, t.userId), eq(authTokens.kind, t.kind), isNull(authTokens.usedAt)))
	await db.insert(authTokens).values(t)
}
export async function findAuthToken(db: Db, hash: string, kind: Kind): Promise<AuthToken | undefined> {
	const [r] = await db.select().from(authTokens).where(and(eq(authTokens.tokenHash, hash), eq(authTokens.kind, kind))).limit(1)
	return r
}
/** True only for the first caller; a second use of the same link gets false. */
export async function useAuthToken(db: Db, id: string, at: Date): Promise<boolean> {
	const [res] = await db.update(authTokens).set({ usedAt: at }).where(and(eq(authTokens.id, id), isNull(authTokens.usedAt)))
	return res.affectedRows === 1
}

export async function createOtp(db: Db, o: typeof phoneOtps.$inferInsert): Promise<void> {
	await db.update(phoneOtps).set({ usedAt: o.createdAt }).where(and(eq(phoneOtps.userId, o.userId), isNull(phoneOtps.usedAt)))
	await db.insert(phoneOtps).values(o)
}
export async function latestOtp(db: Db, userId: string): Promise<PhoneOtp | undefined> {
	const [r] = await db.select().from(phoneOtps).where(eq(phoneOtps.userId, userId)).orderBy(desc(phoneOtps.createdAt), desc(phoneOtps.id)).limit(1)
	return r
}
export async function bumpOtpAttempts(db: Db, id: string, lockUntil: Date | null): Promise<void> {
	await db.update(phoneOtps).set({ attempts: sql`${phoneOtps.attempts} + 1`, ...(lockUntil ? { lockedUntil: lockUntil } : {}) }).where(eq(phoneOtps.id, id))
}
export async function useOtp(db: Db, id: string, at: Date): Promise<boolean> {
	const [res] = await db.update(phoneOtps).set({ usedAt: at }).where(and(eq(phoneOtps.id, id), isNull(phoneOtps.usedAt)))
	return res.affectedRows === 1
}

export async function markEmailVerified(db: Db, userId: string, at: Date): Promise<void> {
	await db.update(users).set({ emailVerifiedAt: at }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
}
export async function markPhoneVerified(db: Db, userId: string, at: Date): Promise<void> {
	await db.update(users).set({ phoneVerifiedAt: at }).where(eq(users.id, userId))
}
/** Changing the number clears its verification. */
export async function changePhone(db: Db, userId: string, phone: string): Promise<void> {
	await db.update(users).set({ phone, phoneVerifiedAt: null }).where(eq(users.id, userId))
}
/** New password: bumps token_version so every live access token dies at once. */
export async function setPassword(db: Db, userId: string, passwordHash: string): Promise<number> {
	await db.update(users).set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, userId))
	const [u] = await db.select({ tv: users.tokenVersion }).from(users).where(eq(users.id, userId))
	return u.tv
}

export async function countOtpsSince(db: Db, userId: string, since: Date): Promise<number> {
	const [r] = await db.select({ n: sql<number>`count(*)` }).from(phoneOtps).where(and(eq(phoneOtps.userId, userId), gte(phoneOtps.createdAt, since)))
	return Number(r.n)
}
