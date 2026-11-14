import { and, eq, like, or, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { facilities } from '../schema'

/** Public search: verified facilities only, by name or town, at most 20. */
export async function searchFacilities(db: Db, q: string) {
	const term = `%${q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`
	const match = q.trim() ? or(like(facilities.name, term), like(facilities.town, term)) : undefined
	return db
		.select({ id: facilities.id, name: facilities.name, type: facilities.type, town: facilities.town, county: facilities.county })
		.from(facilities)
		.where(and(eq(facilities.status, 'verified'), match))
		.orderBy(facilities.name)
		.limit(20)
}

export async function facilityExists(db: Db, id: string): Promise<boolean> {
	const [f] = await db.select({ n: sql<number>`1` }).from(facilities).where(and(eq(facilities.id, id), eq(facilities.status, 'verified'))).limit(1)
	return !!f
}
