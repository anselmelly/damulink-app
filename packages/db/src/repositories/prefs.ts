import { eq } from 'drizzle-orm'
import type { Db } from '../client'
import { donorPrefs } from '../schema'

export type DonorPrefs = typeof donorPrefs.$inferSelect

export async function getPrefs(db: Db, userId: string): Promise<DonorPrefs | undefined> {
	const [r] = await db.select().from(donorPrefs).where(eq(donorPrefs.userId, userId)).limit(1)
	return r
}

/** Creates the row with the given values, or changes just those values on an existing row. */
export async function savePrefs(db: Db, row: typeof donorPrefs.$inferInsert): Promise<void> {
	const { userId: _u, ...changes } = row
	await db.insert(donorPrefs).values(row).onDuplicateKeyUpdate({ set: changes })
}
