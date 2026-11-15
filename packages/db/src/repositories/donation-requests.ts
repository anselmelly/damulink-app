import { and, asc, count, desc, eq, gte, inArray, lt, ne, or } from 'drizzle-orm'
import type { Db } from '../client'
import { donationRequests, facilities, users } from '../schema'

export type DonationRequestRow = typeof donationRequests.$inferSelect

export async function insertDonationRequest(db: Db, r: typeof donationRequests.$inferInsert): Promise<void> {
	await db.insert(donationRequests).values(r)
}

/** A donor can have one request that is still alive (asked, or scheduled and not done yet). */
export async function hasOpenDonationRequest(db: Db, userId: string): Promise<boolean> {
	const [r] = await db.select({ id: donationRequests.id }).from(donationRequests).where(and(eq(donationRequests.userId, userId), inArray(donationRequests.status, ['requested', 'scheduled']))).limit(1)
	return !!r
}

export async function listDonationRequests(db: Db, userId: string) {
	return db
		.select({ r: donationRequests, facilityName: facilities.name })
		.from(donationRequests)
		.innerJoin(facilities, eq(facilities.id, donationRequests.facilityId))
		.where(eq(donationRequests.userId, userId))
		.orderBy(desc(donationRequests.createdAt), desc(donationRequests.id))
}

export async function findDonationRequest(db: Db, id: string, userId: string) {
	const [row] = await db
		.select({ r: donationRequests, facilityName: facilities.name })
		.from(donationRequests)
		.innerJoin(facilities, eq(facilities.id, donationRequests.facilityId))
		.where(and(eq(donationRequests.id, id), eq(donationRequests.userId, userId)))
		.limit(1)
	return row
}

/** Cancels a request that is still alive. False if it was already finished or cancelled. */
export async function cancelDonationRequest(db: Db, id: string, userId: string, at: Date): Promise<boolean> {
	const [res] = await db
		.update(donationRequests)
		.set({ status: 'cancelled', cancelledBy: 'donor', updatedAt: at })
		.where(and(eq(donationRequests.id, id), eq(donationRequests.userId, userId), inArray(donationRequests.status, ['requested', 'scheduled'])))
	return res.affectedRows === 1
}

/** The donor asks the facility to move a booked visit. False when it is not booked (or not theirs). */
export async function askReschedule(db: Db, id: string, userId: string, at: Date): Promise<boolean> {
	const [res] = await db.update(donationRequests).set({ rescheduleAsked: true, updatedAt: at }).where(and(eq(donationRequests.id, id), eq(donationRequests.userId, userId), eq(donationRequests.status, 'scheduled')))
	return res.affectedRows === 1
}

// ---------- the facility's side
export type RequestTabKey = 'follow_up' | 'scheduled' | 'past'
const tabWhere = (facilityId: string, tab: RequestTabKey) =>
	and(
		eq(donationRequests.facilityId, facilityId),
		tab === 'follow_up' ? or(eq(donationRequests.status, 'requested'), and(eq(donationRequests.status, 'scheduled'), eq(donationRequests.rescheduleAsked, true))) : tab === 'scheduled' ? eq(donationRequests.status, 'scheduled') : inArray(donationRequests.status, ['completed', 'cancelled', 'no_show']),
	)

export async function donorRequestsFor(db: Db, facilityId: string, tab: RequestTabKey, limit = 100) {
	return db
		.select({ r: donationRequests, u: users })
		.from(donationRequests)
		.innerJoin(users, eq(users.id, donationRequests.userId))
		.where(tabWhere(facilityId, tab))
		.orderBy(...(tab === 'scheduled' ? [asc(donationRequests.scheduledAt)] : tab === 'past' ? [desc(donationRequests.updatedAt)] : [asc(donationRequests.createdAt)]), asc(donationRequests.id))
		.limit(limit)
}
export async function donorRequestCounts(db: Db, facilityId: string): Promise<Record<RequestTabKey, number>> {
	const out = {} as Record<RequestTabKey, number>
	for (const tab of ['follow_up', 'scheduled', 'past'] as const) out[tab] = Number((await db.select({ n: count() }).from(donationRequests).where(tabWhere(facilityId, tab)))[0]?.n ?? 0)
	return out
}
export async function getFacilityRequest(db: Db, facilityId: string, id: string) {
	const [row] = await db.select({ r: donationRequests, u: users }).from(donationRequests).innerJoin(users, eq(users.id, donationRequests.userId)).where(and(eq(donationRequests.id, id), eq(donationRequests.facilityId, facilityId))).limit(1)
	return row
}
/** Moves a request only if it is still in one of the `from` states. False when someone else got there first. */
export async function moveFacilityRequest(db: Db, id: string, from: readonly (typeof donationRequests.$inferSelect)['status'][], changes: Partial<typeof donationRequests.$inferInsert>): Promise<boolean> {
	const [res] = await db.update(donationRequests).set(changes).where(and(eq(donationRequests.id, id), inArray(donationRequests.status, [...from])))
	return res.affectedRows === 1
}
/** Booked visits at this facility between two moments (for the busy-hour warning). */
export async function bookedBetween(db: Db, facilityId: string, from: Date, to: Date, exceptId: string): Promise<number> {
	const [r] = await db.select({ n: count() }).from(donationRequests).where(and(eq(donationRequests.facilityId, facilityId), eq(donationRequests.status, 'scheduled'), gte(donationRequests.scheduledAt, from), lt(donationRequests.scheduledAt, to), ne(donationRequests.id, exceptId)))
	return Number(r?.n ?? 0)
}
