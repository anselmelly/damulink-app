import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { callAlerts, calls, donorPrefs, facilities, userExtraFacilities, users } from '../schema'

export type CallAlert = typeof callAlerts.$inferSelect

/** Active donors with a verified phone, a recorded blood type from `types`, and their preferences (if they ever saved any). */
export async function candidateDonors(db: Db, types: string[]) {
	if (!types.length) return []
	return db
		.select({ u: users, p: donorPrefs })
		.from(users)
		.leftJoin(donorPrefs, eq(donorPrefs.userId, users.id))
		.where(and(eq(users.status, 'active'), isNotNull(users.phoneVerifiedAt), isNotNull(users.sex), isNotNull(users.dateOfBirth), inArray(users.bloodType, types as any)))
}

export type Place = { id: string; lat: number | null; lng: number | null; county: string }
/** Each donor's facilities (home and extra) with their pins. */
export async function donorPlaces(db: Db, ids: string[]): Promise<Map<string, Place[]>> {
	const out = new Map<string, Place[]>(ids.map((i) => [i, []]))
	if (!ids.length) return out
	const cols = { id: facilities.id, lat: facilities.lat, lng: facilities.lng, county: facilities.county }
	const home = await db.select({ userId: users.id, ...cols }).from(users).innerJoin(facilities, eq(facilities.id, users.homeFacilityId)).where(inArray(users.id, ids))
	const extra = await db.select({ userId: userExtraFacilities.userId, ...cols }).from(userExtraFacilities).innerJoin(facilities, eq(facilities.id, userExtraFacilities.facilityId)).where(inArray(userExtraFacilities.userId, ids))
	for (const { userId, ...f } of [...home, ...extra]) out.get(userId)!.push(f)
	return out
}

export async function alertedUserIds(db: Db, callId: string): Promise<Set<string>> {
	const rows = await db.select({ u: callAlerts.userId }).from(callAlerts).where(eq(callAlerts.callId, callId))
	return new Set(rows.map((r) => r.u))
}
export async function alertRows(db: Db, callId: string): Promise<CallAlert[]> {
	return db.select().from(callAlerts).where(eq(callAlerts.callId, callId))
}

/** How many alerts were sent to each donor since `since` (for the weekly cap). */
export async function sentSince(db: Db, userIds: string[], since: Date): Promise<Map<string, number>> {
	const out = new Map<string, number>()
	if (!userIds.length) return out
	const rows = await db.select({ u: callAlerts.userId, n: sql<number>`count(*)` }).from(callAlerts).where(and(inArray(callAlerts.userId, userIds), eq(callAlerts.status, 'sent'), gte(callAlerts.sentAt, since))).groupBy(callAlerts.userId)
	for (const r of rows) out.set(r.u, Number(r.n))
	return out
}

/** Takes the donor's place in the call. True only for the caller that got it, so nobody is texted twice. */
export async function reserveAlert(db: Db, row: typeof callAlerts.$inferInsert): Promise<boolean> {
	try {
		await db.insert(callAlerts).values(row)
		return true
	} catch (e: any) {
		if (e?.cause?.code === 'ER_DUP_ENTRY' || e?.code === 'ER_DUP_ENTRY') return false
		throw e
	}
}
export async function markAlert(db: Db, id: string, changes: Partial<typeof callAlerts.$inferInsert>): Promise<void> {
	await db.update(callAlerts).set(changes).where(eq(callAlerts.id, id))
}

/** The donor's most recent sent alert since `since` whose call is still live. */
export async function latestLiveAlert(db: Db, userId: string, since: Date) {
	const [r] = await db
		.select({ a: callAlerts, c: calls })
		.from(callAlerts)
		.innerJoin(calls, eq(calls.id, callAlerts.callId))
		.where(and(eq(callAlerts.userId, userId), eq(callAlerts.status, 'sent'), gte(callAlerts.sentAt, since), eq(calls.status, 'live')))
		.orderBy(desc(callAlerts.sentAt))
		.limit(1)
	return r
}

export async function liveSmsCalls(db: Db) {
	return db.select().from(calls).where(and(eq(calls.status, 'live'), eq(calls.smsEnabled, true)))
}

/** STOP: SMS alerts off, on the account and on saved preferences. */
export async function smsOff(db: Db, userId: string): Promise<void> {
	await db.update(users).set({ smsOptIn: false }).where(eq(users.id, userId))
	await db.update(donorPrefs).set({ smsAlerts: false }).where(eq(donorPrefs.userId, userId))
}
export async function userByPhone(db: Db, phone: string) {
	const [r] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
	return r
}
