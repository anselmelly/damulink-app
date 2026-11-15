import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { driveAlerts, driveInterest, drives, facilities, labSamples, users, visits, walkinVisits } from '../schema'

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

// ---------------------------------------------------------------- the public side

export type PublicDriveRow = { d: Drive; facilityName: string; facilityTown: string }

/** Published public drives that have not ended, soonest first. `time` is now in Nairobi as HH:MM. */
export async function listPublicDrives(db: Db, o: { day: string; time: string; town?: string }): Promise<PublicDriveRow[]> {
	const rows = await db
		.select({ d: drives, facilityName: facilities.name, facilityTown: facilities.town })
		.from(drives)
		.innerJoin(facilities, eq(facilities.id, drives.facilityId))
		.where(and(eq(drives.status, 'published'), eq(drives.isPublic, true), sql`(${drives.date} > ${o.day} or (${drives.date} = ${o.day} and ${drives.ends} > ${o.time}))`, o.town ? sql`lower(${drives.town}) = lower(${o.town})` : undefined))
		.orderBy(asc(drives.date), asc(drives.starts))
		.limit(100)
	return rows
}

/** A drive people can see: public, and published, closed or cancelled. Drafts, taken-down and SMS-only drives are not found. */
export async function getPublicDrive(db: Db, key: { number: number } | { short: string }): Promise<PublicDriveRow | undefined> {
	const [r] = await db
		.select({ d: drives, facilityName: facilities.name, facilityTown: facilities.town })
		.from(drives)
		.innerJoin(facilities, eq(facilities.id, drives.facilityId))
		.where(and('number' in key ? eq(drives.number, key.number) : eq(drives.short, key.short), eq(drives.isPublic, true), inArray(drives.status, ['published', 'closed', 'cancelled'])))
		.limit(1)
	return r
}

export async function hasInterest(db: Db, driveId: string, o: { userId?: string; phone?: string | null; name?: string }): Promise<boolean> {
	const who = o.userId ? eq(driveInterest.userId, o.userId) : o.phone ? eq(driveInterest.phone, o.phone) : and(sql`${driveInterest.userId} is null`, sql`${driveInterest.phone} is null`, sql`lower(${driveInterest.name}) = lower(${o.name ?? ''})`)
	const [r] = await db.select({ id: driveInterest.id }).from(driveInterest).where(and(eq(driveInterest.driveId, driveId), who)).limit(1)
	return !!r
}
export const addInterest = (db: Db, row: typeof driveInterest.$inferInsert) => db.insert(driveInterest).values(row)

// ---------------------------------------------------------------- the day, closing, the summary

export async function driveInterestList(db: Db, driveId: string) {
	return db
		.select({ id: driveInterest.id, name: driveInterest.name, phone: driveInterest.phone, userId: driveInterest.userId, arrivedAt: driveInterest.arrivedAt, userPhone: users.phone, smsOk: sql<number>`(${users.smsOptIn} = 1 and ${users.phoneVerifiedAt} is not null)` })
		.from(driveInterest)
		.leftJoin(users, eq(users.id, driveInterest.userId))
		.where(eq(driveInterest.driveId, driveId))
		.orderBy(asc(driveInterest.createdAt), asc(driveInterest.id))
}

/** Ticks or unticks one arrival. False when the row is not on this drive's list. */
export async function setArrived(db: Db, driveId: string, id: string, at: Date | null): Promise<boolean> {
	const [r] = await db.select({ id: driveInterest.id }).from(driveInterest).where(and(eq(driveInterest.id, id), eq(driveInterest.driveId, driveId))).limit(1)
	if (!r) return false
	await db.update(driveInterest).set({ arrivedAt: at }).where(eq(driveInterest.id, id))
	return true
}

export const deleteInterest = (db: Db, driveId: string) => db.delete(driveInterest).where(eq(driveInterest.driveId, driveId))

/** Closing keeps the counts and deletes the names and phones. */
export async function closeDriveRow(db: Db, d: Drive, now: Date): Promise<void> {
	const [i] = await db.select({ total: count(), came: sql<number>`coalesce(sum(${driveInterest.arrivedAt} is not null), 0)` }).from(driveInterest).where(eq(driveInterest.driveId, d.id))
	await db.update(drives).set({ status: 'closed', closedAt: now, interestTotal: Number(i?.total ?? 0), interestCame: Number(i?.came ?? 0), updatedAt: now }).where(eq(drives.id, d.id))
	await deleteInterest(db, d.id)
}

/** What happened at a drive, from the visits and walk-ins tied to it. Counts only. */
export async function driveCounts(db: Db, d: Drive) {
	const v = await db.select({ k: visits.kind, n: count() }).from(visits).where(and(eq(visits.driveId, d.id), sql`${visits.kind} != 'no_show'`)).groupBy(visits.kind)
	const w = await db.select({ k: walkinVisits.outcome, n: count() }).from(walkinVisits).where(eq(walkinVisits.driveId, d.id)).groupBy(walkinVisits.outcome)
	const pick = (rows: { k: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.k, Number(r.n)])) as Record<string, number>
	const [vv, ww] = [pick(v), pick(w)]
	const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
	// "signed up with us on the day": the facility is their home facility and the account was made on the drive date (Nairobi)
	const [s] = await db.select({ n: count() }).from(users).where(and(eq(users.homeFacilityId, d.facilityId), sql`date(date_add(${users.createdAt}, interval 3 hour)) = ${d.date}`))
	return {
		checkedIn: sum(vv) + sum(ww),
		donated: (vv.donated ?? 0) + (ww.donated ?? 0),
		deferred: (vv.deferred ?? 0) + (ww.deferred ?? 0),
		tested: (vv.test ?? 0) + (ww.test ?? 0),
		walkins: sum(ww),
		byCode: sum(vv),
		signups: Number(s?.n ?? 0),
	}
}

/** Blood types of the donations at this drive (verified types only), and results still waiting. */
export async function driveBloodTypes(db: Db, d: Drive): Promise<{ types: Record<string, number>; pending: number }> {
	const a = await db.select({ t: users.bloodType, n: count() }).from(visits).innerJoin(users, eq(users.id, visits.userId)).where(and(eq(visits.driveId, d.id), eq(visits.kind, 'donated'), sql`${users.bloodType} is not null`)).groupBy(users.bloodType)
	const b = await db.select({ t: walkinVisits.bloodType, n: count() }).from(walkinVisits).where(and(eq(walkinVisits.driveId, d.id), eq(walkinVisits.outcome, 'donated'), sql`${walkinVisits.bloodType} is not null`)).groupBy(walkinVisits.bloodType)
	const types: Record<string, number> = {}
	for (const r of [...a, ...b]) types[r.t!] = (types[r.t!] ?? 0) + Number(r.n)
	const [p] = await db.select({ n: count() }).from(labSamples).innerJoin(visits, eq(visits.donationId, labSamples.donationId)).where(and(eq(visits.driveId, d.id), eq(labSamples.status, 'pending')))
	return { types, pending: Number(p?.n ?? 0) }
}

export const staleDrives = (db: Db, day: string) => db.select().from(drives).where(and(eq(drives.status, 'published'), sql`${drives.date} < ${day}`))

/** Interest rows older than the cutoff, on drives that are not running any more. */
export const sweepInterest = (db: Db, cutoff: Date, day: string) =>
	db.delete(driveInterest).where(and(sql`${driveInterest.createdAt} < ${cutoff}`, sql`${driveInterest.driveId} in (select id from drives where status != 'published' or date < ${day})`))

/** The drive a desk may tie a visit to: published, this facility's, running today. */
export async function tieableDrive(db: Db, id: string, facilityId: string, day: string): Promise<boolean> {
	const [r] = await db.select({ id: drives.id }).from(drives).where(and(eq(drives.id, id), eq(drives.facilityId, facilityId), eq(drives.status, 'published'), eq(drives.date, day))).limit(1)
	return !!r
}
