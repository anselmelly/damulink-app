import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../client'
import { donationRequests, donations, labSamples, users, visits, walkinVisits } from '../schema'

export type Donation = typeof donations.$inferSelect
export type LabSample = typeof labSamples.$inferSelect

export async function findDonorByCode(db: Db, code: string) {
	const [u] = await db.select().from(users).where(and(eq(users.donorCode, code), eq(users.status, 'active'))).limit(1)
	return u
}

export async function donationCount(db: Db, userId: string): Promise<number> {
	const [r] = await db.select({ n: count() }).from(donations).where(eq(donations.userId, userId))
	return Number(r?.n ?? 0)
}

/** The donor's next booked visit at this facility, if any. */
export async function bookedVisit(db: Db, userId: string, facilityId: string) {
	const [r] = await db
		.select()
		.from(donationRequests)
		.where(and(eq(donationRequests.userId, userId), eq(donationRequests.facilityId, facilityId), eq(donationRequests.status, 'scheduled')))
		.orderBy(asc(donationRequests.scheduledAt))
		.limit(1)
	return r
}
export async function moveBookedVisit(db: Db, id: string, status: 'completed' | 'cancelled' | 'no_show', now: Date): Promise<void> {
	await db.update(donationRequests).set({ status, updatedAt: now }).where(and(eq(donationRequests.id, id), eq(donationRequests.status, 'scheduled')))
}

export async function insertDonation(db: Db, d: typeof donations.$inferInsert): Promise<void> {
	await db.insert(donations).values(d)
}
export async function insertVisit(db: Db, v: typeof visits.$inferInsert): Promise<void> {
	await db.insert(visits).values(v)
}
export async function insertSample(db: Db, s: typeof labSamples.$inferInsert): Promise<void> {
	await db.insert(labSamples).values(s)
}

export async function pendingSamples(db: Db, facilityId: string) {
	return db
		.select({ s: labSamples, name: users.name, code: users.donorCode })
		.from(labSamples)
		.innerJoin(users, eq(users.id, labSamples.userId))
		.where(and(eq(labSamples.facilityId, facilityId), eq(labSamples.status, 'pending')))
		.orderBy(asc(labSamples.createdAt), asc(labSamples.id))
}
export async function getSample(db: Db, facilityId: string, id: string): Promise<LabSample | undefined> {
	const [s] = await db.select().from(labSamples).where(and(eq(labSamples.id, id), eq(labSamples.facilityId, facilityId))).limit(1)
	return s
}
/** Closes a pending sample; false when somebody else already did. */
export async function closeSample(db: Db, id: string, by: string, now: Date): Promise<boolean> {
	const [r] = await db.update(labSamples).set({ status: 'resulted', resultedAt: now, resultedBy: by }).where(and(eq(labSamples.id, id), eq(labSamples.status, 'pending')))
	return r.affectedRows === 1
}

export async function insertWalkin(db: Db, w: typeof walkinVisits.$inferInsert): Promise<void> {
	await db.insert(walkinVisits).values(w)
}
export async function clearInvitePhone(db: Db, id: string): Promise<void> {
	await db.update(walkinVisits).set({ invitePhone: null }).where(eq(walkinVisits.id, id))
}

/**
 * Donors whose latest visit is a deferral with a pause date still ahead of `today` (YYYY-MM-DD).
 * A later visit of any kind ends the pause by itself, so only the most recent visit counts.
 */
export async function heldUserIds(db: Db, userIds: string[], today: string): Promise<Set<string>> {
	if (!userIds.length) return new Set()
	const rows = await db
		.select({ userId: visits.userId, kind: visits.kind, returnAfter: visits.returnAfter, createdAt: visits.createdAt })
		.from(visits)
		.where(inArray(visits.userId, userIds))
		.orderBy(desc(visits.createdAt), desc(visits.id))
	const latest = new Map<string, (typeof rows)[number]>()
	for (const r of rows) if (!latest.has(r.userId)) latest.set(r.userId, r)
	return new Set([...latest.values()].filter((v) => v.kind === 'deferred' && v.returnAfter && v.returnAfter > today).map((v) => v.userId))
}
export async function heldUntil(db: Db, userId: string, today: string): Promise<string | null> {
	const [r] = await db.select({ kind: visits.kind, returnAfter: visits.returnAfter }).from(visits).where(eq(visits.userId, userId)).orderBy(desc(visits.createdAt), desc(visits.id)).limit(1)
	return r?.kind === 'deferred' && r.returnAfter && r.returnAfter > today ? r.returnAfter : null
}

/** Facts only a facility records. Weight is left alone when none is given. */
export async function recordDonorFacts(db: Db, userId: string, f: { lastDonationOn?: string; weightKg?: number | null; bloodType?: (typeof users.$inferInsert)['bloodType'] }): Promise<void> {
	const set = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null))
	if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, userId))
}

/** Donors who asked for an appointment here (still waiting or booked), newest request first. */
export async function recentRequests(db: Db, facilityId: string, limit: number) {
	return db
		.select({ id: donationRequests.id, kind: donationRequests.kind, status: donationRequests.status, at: donationRequests.createdAt, scheduledAt: donationRequests.scheduledAt, name: users.name, code: users.donorCode })
		.from(donationRequests)
		.innerJoin(users, eq(users.id, donationRequests.userId))
		.where(and(eq(donationRequests.facilityId, facilityId), inArray(donationRequests.status, ['requested', 'scheduled'])))
		.orderBy(desc(donationRequests.createdAt), desc(donationRequests.id))
		.limit(limit)
}
