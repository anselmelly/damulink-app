import { and, asc, count, desc, eq, gte, inArray, isNotNull, like, lt, or, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { bloodRequests, donations, donorPrefs, donationRequests, labSamples, recordCorrections, users } from '../schema'

// ---------- corrections
/** Does this facility hold a record of the donor: a donation it took, or a blood type it verified? */
export async function hasRecordHere(db: Db, userId: string, facilityId: string): Promise<boolean> {
	const [d] = await db.select({ id: donations.id }).from(donations).where(and(eq(donations.userId, userId), eq(donations.facilityId, facilityId))).limit(1)
	if (d) return true
	const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.bloodTypeFacilityId, facilityId))).limit(1)
	return !!u
}
export async function latestDonationHere(db: Db, userId: string, facilityId: string) {
	const [d] = await db.select().from(donations).where(and(eq(donations.userId, userId), eq(donations.facilityId, facilityId))).orderBy(desc(donations.donatedOn), desc(donations.createdAt)).limit(1)
	return d
}
/** The donation just before `date` (any facility), for the waiting-period check. */
export async function donationBefore(db: Db, userId: string, date: string, exceptId: string) {
	const [d] = await db.select().from(donations).where(and(eq(donations.userId, userId), lt(donations.donatedOn, date), sql`${donations.id} <> ${exceptId}`)).orderBy(desc(donations.donatedOn)).limit(1)
	return d
}
export async function updateDonation(db: Db, id: string, changes: Partial<typeof donations.$inferInsert>): Promise<void> {
	await db.update(donations).set(changes).where(eq(donations.id, id))
}
export async function insertCorrections(db: Db, rows: (typeof recordCorrections.$inferInsert)[]): Promise<void> {
	if (rows.length) await db.insert(recordCorrections).values(rows)
}
export async function listCorrections(db: Db, facilityId: string, userId: string) {
	return db
		.select({ c: recordCorrections, by: users.name })
		.from(recordCorrections)
		.innerJoin(users, eq(users.id, recordCorrections.correctedBy))
		.where(and(eq(recordCorrections.facilityId, facilityId), eq(recordCorrections.userId, userId)))
		.orderBy(desc(recordCorrections.createdAt), desc(recordCorrections.id))
		.limit(50)
}

// ---------- the donors list
export async function homeDonors(db: Db, facilityId: string, o: { q?: string; status?: 'verified' | 'registered'; bloodType?: string; limit: number; offset: number }) {
	const where = and(
		eq(users.homeFacilityId, facilityId),
		isNotNull(users.donorCode),
		o.status === 'verified' ? isNotNull(users.bloodType) : o.status === 'registered' ? sql`${users.bloodType} is null` : undefined,
		o.bloodType ? eq(users.bloodType, o.bloodType as any) : undefined,
		o.q ? or(like(users.name, `%${o.q}%`), like(users.donorCode, `%${o.q.toUpperCase()}%`)) : undefined,
	)
	const items = await db.select({ u: users, p: donorPrefs }).from(users).leftJoin(donorPrefs, eq(donorPrefs.userId, users.id)).where(where).orderBy(asc(users.name), asc(users.id)).limit(o.limit).offset(o.offset)
	const [t] = await db.select({ n: count() }).from(users).where(where)
	return { items, total: Number(t?.n ?? 0) }
}
export async function homeDonorCounts(db: Db, facilityId: string) {
	const [r] = await db
		.select({
			all: count(),
			verified: sql<number>`sum(${users.bloodType} is not null)`,
			alertsOn: sql<number>`sum(coalesce(${donorPrefs.smsAlerts}, ${users.smsOptIn}))`,
		})
		.from(users)
		.leftJoin(donorPrefs, eq(donorPrefs.userId, users.id))
		.where(and(eq(users.homeFacilityId, facilityId), isNotNull(users.donorCode)))
	const all = Number(r?.all ?? 0)
	const verified = Number(r?.verified ?? 0)
	return { all, verified, registered: all - verified, alertsOn: Number(r?.alertsOn ?? 0) }
}

// ---------- the home screen
export async function waitingRequests(db: Db, facilityId: string, limit: number) {
	const where = and(eq(bloodRequests.facilityId, facilityId), inArray(bloodRequests.status, ['pending', 'confirmed']))
	const rows = await db.select().from(bloodRequests).where(where).orderBy(asc(bloodRequests.createdAt), asc(bloodRequests.id)).limit(limit)
	const [t] = await db.select({ n: count() }).from(bloodRequests).where(where)
	return { rows, total: Number(t?.n ?? 0) }
}
export async function visitsBetween(db: Db, facilityId: string, from: Date, to: Date) {
	return db
		.select({ r: donationRequests, name: users.name })
		.from(donationRequests)
		.innerJoin(users, eq(users.id, donationRequests.userId))
		.where(and(eq(donationRequests.facilityId, facilityId), inArray(donationRequests.status, ['scheduled', 'completed']), gte(donationRequests.scheduledAt, from), lt(donationRequests.scheduledAt, to)))
		.orderBy(asc(donationRequests.scheduledAt), asc(donationRequests.id))
}
export async function pendingSampleCount(db: Db, facilityId: string): Promise<number> {
	const [r] = await db.select({ n: count() }).from(labSamples).where(and(eq(labSamples.facilityId, facilityId), eq(labSamples.status, 'pending')))
	return Number(r?.n ?? 0)
}
