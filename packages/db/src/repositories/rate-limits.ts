import { and, eq, lte, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { rateLimits } from '../schema'

/** Adds one hit to a fixed window and returns the count in the current window. The window restarts once `windowMs` has passed. */
export async function hit(db: Db, key: string, windowMs: number, now: Date): Promise<number> {
	const cutoff = new Date(now.getTime() - windowMs)
	// 1. a window that has passed starts over; 2. then add this hit (insert, or count + 1)
	await db.update(rateLimits).set({ windowStart: now, count: 0 }).where(and(eq(rateLimits.key, key), lte(rateLimits.windowStart, cutoff)))
	await db
		.insert(rateLimits)
		.values({ key, windowStart: now, count: 1 })
		.onDuplicateKeyUpdate({ set: { count: sql`${rateLimits.count} + 1` } })
	const [row] = await db.select({ count: rateLimits.count }).from(rateLimits).where(eq(rateLimits.key, key))
	return row?.count ?? 1
}

/** Reads the count without adding a hit (0 when the window has passed). */
export async function peek(db: Db, key: string, windowMs: number, now: Date): Promise<number> {
	const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key))
	if (!row || row.windowStart.getTime() <= now.getTime() - windowMs) return 0
	return row.count
}

export async function reset(db: Db, key: string): Promise<void> {
	await db.delete(rateLimits).where(eq(rateLimits.key, key))
}
