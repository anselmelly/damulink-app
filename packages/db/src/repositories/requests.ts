import { and, asc, count, desc, eq, gte, inArray, like, max, or, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { bloodRequests, facilities, requestEvents, users } from '../schema'

export type BloodRequest = typeof bloodRequests.$inferSelect
export type RequestEvent = typeof requestEvents.$inferSelect
export type NewRequest = Omit<typeof bloodRequests.$inferInsert, 'number'>

const OPEN = ['pending', 'needs_info', 'confirmed', 'approved', 'published'] as const

/** Stores a request with the next running number and its first event. Two sent together never share a number: the unique index decides, the loser tries again. */
export async function insertRequest(db: Db, r: NewRequest, event: typeof requestEvents.$inferInsert): Promise<number> {
	for (let attempt = 0; attempt < 8; attempt++) {
		const [m] = await db.select({ n: max(bloodRequests.number) }).from(bloodRequests)
		const number = Number(m?.n ?? 0) + 1
		try {
			await db.insert(bloodRequests).values({ ...r, number })
			await db.insert(requestEvents).values(event)
			return number
		} catch (e: any) {
			if (e?.cause?.code !== 'ER_DUP_ENTRY' && e?.code !== 'ER_DUP_ENTRY') throw e
		}
	}
	throw new Error('could not get a request number')
}

export async function getRequest(db: Db, id: string): Promise<BloodRequest | undefined> {
	const [r] = await db.select().from(bloodRequests).where(eq(bloodRequests.id, id)).limit(1)
	return r
}

/** How many requests this person sent since `since` (cancelled ones count). */
export async function countSentSince(db: Db, userId: string, since: Date): Promise<number> {
	const [r] = await db.select({ n: count() }).from(bloodRequests).where(and(eq(bloodRequests.requesterId, userId), gte(bloodRequests.createdAt, since)))
	return Number(r.n)
}

/** The open request for the same patient at the same facility, if any. */
export async function findOpenForPatient(db: Db, facilityId: string, key: string): Promise<BloodRequest | undefined> {
	const [r] = await db.select().from(bloodRequests).where(and(eq(bloodRequests.facilityId, facilityId), eq(bloodRequests.patientRefKey, key), inArray(bloodRequests.status, [...OPEN]))).limit(1)
	return r
}

export async function listForRequester(db: Db, userId: string, open: boolean) {
	const status = open ? inArray(bloodRequests.status, [...OPEN]) : sql`${bloodRequests.status} not in ('pending','needs_info','confirmed','approved','published')`
	return db
		.select({ r: bloodRequests, facilityName: facilities.name, facilityTown: facilities.town })
		.from(bloodRequests)
		.innerJoin(facilities, eq(facilities.id, bloodRequests.facilityId))
		.where(and(eq(bloodRequests.requesterId, userId), status))
		.orderBy(desc(bloodRequests.createdAt), desc(bloodRequests.number))
}

export async function listFacilityRequests(db: Db, facilityId: string, o: { status?: string; q?: string; bloodType?: string }) {
	const q = o.q?.trim()
	const like_ = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null
	const num = q?.match(/^(?:req-?)?0*(\d+)$/i)?.[1]
	const search = q ? or(like(bloodRequests.patientRef, like_!), like(users.name, like_!), num ? eq(bloodRequests.number, Number(num)) : undefined) : undefined
	const where = and(
		eq(bloodRequests.facilityId, facilityId),
		o.status ? inArray(bloodRequests.status, o.status.split(',') as BloodRequest['status'][]) : undefined,
		o.bloodType ? or(eq(bloodRequests.bloodType, o.bloodType), and(sql`${bloodRequests.bloodType} is null`, eq(bloodRequests.bloodTypeAsked, o.bloodType))) : undefined,
		search,
	)
	const rows = await db
		.select({ r: bloodRequests, requesterName: users.name })
		.from(bloodRequests)
		.leftJoin(users, eq(users.id, bloodRequests.requesterId))
		.where(where)
		.orderBy(o.status === 'pending' ? asc(bloodRequests.createdAt) : desc(bloodRequests.createdAt), asc(bloodRequests.number))
		.limit(200)
	const grouped = await db.select({ status: bloodRequests.status, n: count() }).from(bloodRequests).where(eq(bloodRequests.facilityId, facilityId)).groupBy(bloodRequests.status)
	return { rows, counts: Object.fromEntries(grouped.map((g) => [g.status, Number(g.n)])) as Record<string, number> }
}

export async function requesterCounts(db: Db, userId: string) {
	const [r] = await db
		.select({
			total: count(),
			rejected: sql<number>`coalesce(sum(case when ${bloodRequests.status} = 'rejected' then 1 else 0 end), 0)`,
			cancelled: sql<number>`coalesce(sum(case when ${bloodRequests.status} = 'cancelled' then 1 else 0 end), 0)`,
		})
		.from(bloodRequests)
		.where(eq(bloodRequests.requesterId, userId))
	return { total: Number(r.total), rejected: Number(r.rejected), cancelled: Number(r.cancelled) }
}

export async function listRequestEvents(db: Db, requestId: string, requesterOnly: boolean) {
	return db
		.select()
		.from(requestEvents)
		.where(and(eq(requestEvents.requestId, requestId), requesterOnly ? eq(requestEvents.visibleToRequester, true) : undefined))
		.orderBy(asc(requestEvents.createdAt), asc(requestEvents.id))
}
export async function addRequestEvent(db: Db, e: typeof requestEvents.$inferInsert): Promise<void> {
	await db.insert(requestEvents).values(e)
}

/** Changes the request only if it is still in one of the `from` statuses. True only for the caller that won (two people acting at once cannot both succeed). */
export async function moveRequest(db: Db, id: string, from: readonly string[], changes: Partial<typeof bloodRequests.$inferInsert>): Promise<boolean> {
	const [res] = await db.update(bloodRequests).set(changes).where(and(eq(bloodRequests.id, id), inArray(bloodRequests.status, from as BloodRequest['status'][])))
	return res.affectedRows === 1
}
