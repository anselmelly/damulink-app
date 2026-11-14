import { eq, isNull, and } from 'drizzle-orm'
import type { Db } from '../client'
import { refreshTokens } from '../schema'

export type RefreshToken = typeof refreshTokens.$inferSelect

export async function insertRefresh(db: Db, r: typeof refreshTokens.$inferInsert): Promise<void> {
	await db.insert(refreshTokens).values(r)
}
export async function findRefreshByHash(db: Db, hash: string): Promise<RefreshToken | undefined> {
	const [r] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1)
	return r
}
/** Marks a token used, but only if nobody used it first. Returns false when it was already used (a race or a replay). */
export async function markRefreshUsed(db: Db, id: string, at: Date): Promise<boolean> {
	const [res] = await db.update(refreshTokens).set({ usedAt: at }).where(and(eq(refreshTokens.id, id), isNull(refreshTokens.usedAt)))
	return res.affectedRows === 1
}
export async function revokeFamily(db: Db, familyId: string, at: Date): Promise<void> {
	await db.update(refreshTokens).set({ revokedAt: at }).where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
}
export async function revokeAllForUser(db: Db, userId: string, at: Date): Promise<void> {
	await db.update(refreshTokens).set({ revokedAt: at }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}
