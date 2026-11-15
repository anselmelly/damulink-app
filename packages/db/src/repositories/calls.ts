import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { callResponses, calls, facilities, users } from '../schema'

export type Call = typeof calls.$inferSelect
export type CallResponse = typeof callResponses.$inferSelect
export type NewCall = Omit<typeof calls.$inferInsert, 'number' | 'short'>

const dup = (e: any) => e?.cause?.code === 'ER_DUP_ENTRY' || e?.code === 'ER_DUP_ENTRY'

/** Stores a call with the next running number and a fresh short code. A clash on either unique index means another call won: try again. */
export async function insertCall(db: Db, c: NewCall, newShort: () => string): Promise<{ number: number; short: string }> {
	for (let attempt = 0; attempt < 8; attempt++) {
		const [m] = await db.select({ n: max(calls.number) }).from(calls)
		const number = Number(m?.n ?? 0) + 1
		const short = newShort()
		try {
			await db.insert(calls).values({ ...c, number, short })
			return { number, short }
		} catch (e) {
			if (!dup(e)) throw e
			const [taken] = await db.select({ id: calls.id }).from(calls).where(eq(calls.requestId, c.requestId)).limit(1)
			if (taken) throw e // the request already has its call
		}
	}
	throw new Error('could not get a call number')
}

export async function getCall(db: Db, id: string): Promise<Call | undefined> {
	const [r] = await db.select().from(calls).where(eq(calls.id, id)).limit(1)
	return r
}
export async function getCallForRequest(db: Db, requestId: string): Promise<Call | undefined> {
	const [r] = await db.select().from(calls).where(eq(calls.requestId, requestId)).limit(1)
	return r
}

/** Changes the call only if it is still in one of the `from` statuses. True only for the caller that won. */
export async function moveCall(db: Db, id: string, from: readonly Call['status'][], changes: Partial<typeof calls.$inferInsert>): Promise<boolean> {
	const [res] = await db.update(calls).set(changes).where(and(eq(calls.id, id), inArray(calls.status, [...from])))
	return res.affectedRows === 1
}

export async function dueCalls(db: Db, now: Date): Promise<Call[]> {
	return db.select().from(calls).where(and(eq(calls.status, 'live'), sql`${calls.closesAt} <= ${now}`))
}
export async function liveCallsOf(db: Db, facilityId: string): Promise<Call[]> {
	return db.select().from(calls).where(and(eq(calls.facilityId, facilityId), eq(calls.status, 'live')))
}

/** donated / scheduled counts for the given calls. */
export async function responseCounts(db: Db, callIds: string[]) {
	const out = new Map<string, { donated: number; scheduled: number; yes: number }>(callIds.map((id) => [id, { donated: 0, scheduled: 0, yes: 0 }]))
	if (!callIds.length) return out
	const rows = await db.select({ callId: callResponses.callId, status: callResponses.status, n: count() }).from(callResponses).where(inArray(callResponses.callId, callIds)).groupBy(callResponses.callId, callResponses.status)
	for (const r of rows) {
		const o = out.get(r.callId)!
		if (r.status === 'donated') o.donated = Number(r.n)
		if (r.status === 'scheduled') o.scheduled = Number(r.n)
		if (r.status !== 'not_needed') o.yes += Number(r.n)
	}
	return out
}

export async function listFacilityCalls(db: Db, facilityId: string) {
	return db
		.select()
		.from(calls)
		.where(eq(calls.facilityId, facilityId))
		.orderBy(desc(calls.publishedAt), desc(calls.number))
		.limit(200)
}

export async function listResponses(db: Db, callId: string) {
	return db
		.select({ r: callResponses, name: users.name, phone: users.phone, bloodType: users.bloodType })
		.from(callResponses)
		.innerJoin(users, eq(users.id, callResponses.userId))
		.where(eq(callResponses.callId, callId))
		.orderBy(asc(callResponses.repliedAt), asc(callResponses.id))
}
export async function getResponse(db: Db, callId: string, id: string): Promise<CallResponse | undefined> {
	const [r] = await db.select().from(callResponses).where(and(eq(callResponses.id, id), eq(callResponses.callId, callId))).limit(1)
	return r
}
export async function moveResponse(db: Db, id: string, from: readonly CallResponse['status'][], changes: Partial<typeof callResponses.$inferInsert>): Promise<boolean> {
	const [res] = await db.update(callResponses).set(changes).where(and(eq(callResponses.id, id), inArray(callResponses.status, [...from])))
	return res.affectedRows === 1
}

const URGENCY_RANK = sql`case ${calls.urgency} when 'surge' then 0 when 'urgent' then 1 else 2 end`
/** Live public calls of verified facilities, most urgent first, then newest. */
export async function listPublicCalls(db: Db, o: { bloodType?: string; town?: string; urgent?: boolean }) {
	return db
		.select({ c: calls, facilityName: facilities.name, town: facilities.town, county: facilities.county })
		.from(calls)
		.innerJoin(facilities, eq(facilities.id, calls.facilityId))
		.where(
			and(
				eq(calls.status, 'live'),
				eq(calls.isPublic, true),
				eq(facilities.status, 'verified'),
				o.bloodType ? sql`json_contains(${calls.types}, json_quote(${o.bloodType}))` : undefined,
				o.town ? sql`lower(${facilities.town}) = ${o.town.toLowerCase()}` : undefined,
				o.urgent ? inArray(calls.urgency, ['urgent', 'surge']) : undefined,
			),
		)
		.orderBy(URGENCY_RANK, desc(calls.publishedAt), desc(calls.number))
		.limit(100)
}

/** One public call by number or short code. Calls that are not public or were taken down are not found. */
export async function getPublicCall(db: Db, key: { number?: number | null; short?: string }) {
	const match = key.number != null ? eq(calls.number, key.number) : eq(calls.short, key.short ?? '')
	const [r] = await db
		.select({ c: calls, facilityName: facilities.name, town: facilities.town, county: facilities.county })
		.from(calls)
		.innerJoin(facilities, eq(facilities.id, calls.facilityId))
		.where(and(match, eq(calls.isPublic, true), inArray(calls.status, ['live', 'closed', 'expired'])))
		.limit(1)
	return r
}
