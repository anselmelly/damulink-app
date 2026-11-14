import { eq } from 'drizzle-orm'
import type { Db } from '../client'
import { settings } from '../schema'

export async function getSetting<T>(db: Db, key: string): Promise<T | undefined> {
	const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
	return row ? (row.value as T) : undefined
}

export async function setSetting(db: Db, key: string, value: unknown, now: Date): Promise<void> {
	await db.insert(settings).values({ key, value, updatedAt: now }).onDuplicateKeyUpdate({ set: { value, updatedAt: now } })
}
