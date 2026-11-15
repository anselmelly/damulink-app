import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { driveAlerts, driveInterest, drives } from '../schema'

export type Drive = typeof drives.$inferSelect
export type NewDrive = Omit<typeof drives.$inferInsert, 'number' | 'short'>

const dup = (e: any) => e?.cause?.code === 'ER_DUP_ENTRY' || e?.code === 'ER_DUP_ENTRY'

/** Stores a drive with the next running number and a fresh short code; a clash on either means another drive won, so try again. */
export async function insertDrive(db: Db, d: NewDrive, newShort: () => string): Promise<{ number: number; short: string }> {
	for (let attempt = 0; attempt < 8; attempt++) {
		const [m] = await db.select({ n: max(drives.number) }).from(drives)
		const number = Number(m?.n ?? 0) + 1
		const short = newShort()
		try {
			await db.insert(drives).values({ ...d, number, short })
			return { number, short }
		} catch (e) {
			if (!dup(e)) throw e
		}
	}
	throw new Error('could not get a drive number')
}

export async function getDrive(db: Db, id: string, facilityId: string): Promise<Drive | undefined> {
	const [r] = await db.select().from(drives).where(and(eq(drives.id, id), eq(drives.facilityId, facilityId))).limit(1)
	return r
}

export const updateDrive = (db: Db, id: string, changes: Partial<typeof drives.$inferInsert>) => db.update(drives).set(changes).where(eq(drives.id, id))

/** Drives of one facility for a list tab, with how many people said they are coming. `day` is today in Nairobi. */
export async function listDrives(db: Db, facilityId: string, tab: 'upcoming' | 'today' | 'past', day: string): Promise<(Drive & { interested: number })[]> {
	const open = inArray(drives.status, ['draft', 'published'])
	const where = tab === 'upcoming' ? and(open, sql`${drives.date} > ${day}`) : tab === 'today' ? and(open, eq(drives.date, day)) : sql`(${drives.status} in ('closed','cancelled','taken_down') or ${drives.date} < ${day})`
	const rows = await db
		.select({ d: drives, n: count(driveInterest.id) })
		.from(drives)
		.leftJoin(driveInterest, eq(driveInterest.driveId, drives.id))
		.where(and(eq(drives.facilityId, facilityId), where))
		.groupBy(drives.id)
		.orderBy(...(tab === 'past' ? [desc(drives.date), desc(drives.starts)] : [asc(drives.date), asc(drives.starts)]))
		.limit(200)
	return rows.map((r) => ({ ...r.d, interested: Number(r.n) }))
}

export async function driveTabCounts(db: Db, facilityId: string, day: string): Promise<Record<'upcoming' | 'today' | 'past', number>> {
	const [r] = await db
		.select({
			upcoming: sql<number>`coalesce(sum(${drives.status} in ('draft','published') and ${drives.date} > ${day}), 0)`,
			today: sql<number>`coalesce(sum(${drives.status} in ('draft','published') and ${drives.date} = ${day}), 0)`,
			past: sql<number>`coalesce(sum(${drives.status} in ('closed','cancelled','taken_down') or ${drives.date} < ${day}), 0)`,
		})
		.from(drives)
		.where(eq(drives.facilityId, facilityId))
	return { upcoming: Number(r?.upcoming ?? 0), today: Number(r?.today ?? 0), past: Number(r?.past ?? 0) }
}

export async function openDriveCount(db: Db, facilityId: string, day: string): Promise<number> {
	const [r] = await db.select({ n: count() }).from(drives).where(and(eq(drives.facilityId, facilityId), inArray(drives.status, ['draft', 'published']), sql`${drives.date} >= ${day}`))
	return Number(r?.n ?? 0)
}

export async function interestCount(db: Db, driveId: string): Promise<number> {
	const [r] = await db.select({ n: count() }).from(driveInterest).where(eq(driveInterest.driveId, driveId))
	return Number(r?.n ?? 0)
}

export async function publishedSmsDrives(db: Db, today: string): Promise<Drive[]> {
	return db.select().from(drives).where(and(eq(drives.status, 'published'), eq(drives.smsEnabled, true), sql`${drives.date} >= ${today}`))
}

export async function alertedForDrive(db: Db, driveId: string): Promise<Set<string>> {
	return new Set((await db.select({ u: driveAlerts.userId }).from(driveAlerts).where(eq(driveAlerts.driveId, driveId))).map((r) => r.u))
}
/** Reserves the donor's text for this drive. False when they already have one. */
export async function reserveDriveAlert(db: Db, row: typeof driveAlerts.$inferInsert): Promise<boolean> {
	try {
		await db.insert(driveAlerts).values(row)
		return true
	} catch (e) {
		if (dup(e)) return false
		throw e
	}
}
export const markDriveAlert = (db: Db, id: string, changes: Partial<typeof driveAlerts.$inferInsert>) => db.update(driveAlerts).set(changes).where(eq(driveAlerts.id, id))

/** Facility suspended: its drives come down for good. */
export const takeDownDrives = (db: Db, facilityId: string, now: Date) =>
	db.update(drives).set({ status: 'taken_down', updatedAt: now }).where(and(eq(drives.facilityId, facilityId), inArray(drives.status, ['draft', 'published'])))
