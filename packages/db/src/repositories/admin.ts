import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { auditLog, bloodRequests, calls, facilities, facilityMembers, userFlags, users, visits } from '../schema'

export const listSuperAdmins = (db: Db) =>
	db.select({ id: users.id, name: users.name, email: users.email, addedAt: users.adminAddedAt }).from(users).where(eq(users.isSuperAdmin, true)).orderBy(sql`${users.adminAddedAt} is not null`, asc(users.adminAddedAt), asc(users.name))

export const promoteAdmin = (db: Db, id: string, by: string, now: Date) => db.update(users).set({ isSuperAdmin: true, adminAddedAt: now, adminAddedBy: by }).where(eq(users.id, id))
export const demoteAdmin = (db: Db, id: string) => db.update(users).set({ isSuperAdmin: false }).where(and(eq(users.id, id), eq(users.isSuperAdmin, true)))

// ---------------------------------------------------------------- audit viewer


const esc = (s: string) => s.replace(/[\\%_]/g, '\\$&')

export async function auditPage(db: Db, o: { q?: string; exact?: string[]; prefix?: string[]; page: number; pageSize: number }) {
	const conds = []
	if (o.exact || o.prefix) conds.push(or(...(o.exact?.length ? [inArray(auditLog.action, o.exact)] : []), ...(o.prefix ?? []).map((p) => like(auditLog.action, `${esc(p)}%`))))
	if (o.q) {
		const l = `%${esc(o.q.toLowerCase())}%`
		conds.push(or(sql`lower(${auditLog.action}) like ${l}`, sql`lower(coalesce(${auditLog.detail}, '')) like ${l}`, sql`lower(coalesce(${auditLog.target}, '')) like ${l}`, sql`lower(coalesce(${users.name}, '')) like ${l}`))
	}
	const where = conds.length ? and(...conds) : undefined
	const rows = await db.select({ a: auditLog, actor: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(where).orderBy(desc(auditLog.id)).limit(o.pageSize).offset((o.page - 1) * o.pageSize)
	const [t] = await db.select({ n: sql<number>`count(*)` }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(where)
	return { rows, total: Number(t?.n ?? 0) }
}
/** The first facility each of these people works at, for "Name (Facility)". */
export async function actorFacilities(db: Db, ids: string[]): Promise<Map<string, string>> {
	if (!ids.length) return new Map()
	const rows = await db.select({ u: facilityMembers.userId, n: facilities.name }).from(facilityMembers).innerJoin(facilities, eq(facilities.id, facilityMembers.facilityId)).where(inArray(facilityMembers.userId, ids)).orderBy(asc(facilityMembers.createdAt))
	const m = new Map<string, string>()
	for (const r of rows) if (!m.has(r.u)) m.set(r.u, r.n)
	return m
}
export async function facilityNames(db: Db, ids: string[]): Promise<Map<string, string>> {
	if (!ids.length) return new Map()
	return new Map((await db.select({ id: facilities.id, n: facilities.name }).from(facilities).where(inArray(facilities.id, ids))).map((r) => [r.id, r.n]))
}

// ---------------------------------------------------------------- misuse flags
export const listFlags = (db: Db, status: 'open' | 'all') =>
	db.select({ f: userFlags, name: users.name, phone: users.phone, createdAt: users.createdAt, donorCode: users.donorCode, userStatus: users.status }).from(userFlags).innerJoin(users, eq(users.id, userFlags.userId)).where(status === 'open' ? eq(userFlags.status, 'open') : undefined).orderBy(desc(userFlags.createdAt)).limit(200)
export const openFlagCount = async (db: Db) => Number((await db.select({ n: sql<number>`count(*)` }).from(userFlags).where(eq(userFlags.status, 'open')))[0]?.n ?? 0)
export const getFlag = async (db: Db, id: string) => (await db.select().from(userFlags).where(eq(userFlags.id, id)).limit(1))[0]
export async function insertFlag(db: Db, f: { id: string; userId: string; kind: 'rejected_requests' | 'no_shows'; reason: string; evidence: unknown; now: Date }): Promise<boolean> {
	try {
		await db.insert(userFlags).values({ id: f.id, userId: f.userId, kind: f.kind, reason: f.reason, evidence: f.evidence, status: 'open', openKey: `${f.userId}:${f.kind}`, createdAt: f.now })
		return true
	} catch (e: any) {
		if (e?.cause?.code === 'ER_DUP_ENTRY' || e?.code === 'ER_DUP_ENTRY') return false
		throw e
	}
}
export const resolveFlag = (db: Db, id: string, status: 'dismissed' | 'actioned', note: string | null, by: string, now: Date) => db.update(userFlags).set({ status, openKey: null, note, resolvedAt: now, resolvedBy: by }).where(eq(userFlags.id, id))
export const resolveOpenFlagsOf = (db: Db, userId: string, by: string, now: Date) => db.update(userFlags).set({ status: 'actioned', openKey: null, resolvedAt: now, resolvedBy: by }).where(and(eq(userFlags.userId, userId), eq(userFlags.status, 'open')))
export async function lastResolved(db: Db, userId: string, kind: 'rejected_requests' | 'no_shows'): Promise<Date | null> {
	const [r] = await db.select({ at: sql<Date | null>`max(${userFlags.resolvedAt})` }).from(userFlags).where(and(eq(userFlags.userId, userId), eq(userFlags.kind, kind)))
	const v: unknown = r?.at
	return !v ? null : v instanceof Date ? v : new Date(`${String(v).replace(' ', 'T')}Z`) // raw max() comes back as a UTC string
}
export const rejectedSince = (db: Db, since: Date) =>
	db.select({ userId: bloodRequests.requesterId, number: bloodRequests.number, reason: bloodRequests.rejectReason, at: bloodRequests.decidedAt }).from(bloodRequests).where(and(eq(bloodRequests.status, 'rejected'), sql`${bloodRequests.requesterId} is not null`, sql`${bloodRequests.decidedAt} > ${since}`)).orderBy(desc(bloodRequests.decidedAt))
export const noShowsSince = (db: Db, since: Date) =>
	db.select({ userId: visits.userId, facilityId: visits.facilityId, facility: facilities.name, at: visits.createdAt }).from(visits).innerJoin(facilities, eq(facilities.id, visits.facilityId)).where(and(eq(visits.kind, 'no_show'), sql`${visits.createdAt} > ${since}`)).orderBy(desc(visits.createdAt))
export const cancelOpenRequestsOf = async (db: Db, userId: string, now: Date): Promise<string[]> => {
	const open = await db.select({ id: bloodRequests.id }).from(bloodRequests).where(and(eq(bloodRequests.requesterId, userId), inArray(bloodRequests.status, ['pending', 'needs_info', 'confirmed', 'approved'])))
	if (open.length) await db.update(bloodRequests).set({ status: 'cancelled', updatedAt: now }).where(inArray(bloodRequests.id, open.map((r) => r.id)))
	return open.map((r) => r.id)
}
export const userHasRequests = async (db: Db, userId: string) => (await db.select({ id: bloodRequests.id }).from(bloodRequests).where(eq(bloodRequests.requesterId, userId)).limit(1)).length > 0

// ---------------------------------------------------------------- dashboard
export async function dashboardCounts(db: Db, todayStart: Date) {
	const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0)
	return {
		toVerify: await n(db.select({ n: sql<number>`count(*)` }).from(facilities).where(inArray(facilities.status, ['pending', 'needs_info']))),
		facilitiesVerified: await n(db.select({ n: sql<number>`count(*)` }).from(facilities).where(eq(facilities.status, 'verified'))),
		donors: await n(db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.status, 'active'), sql`${users.donorCode} is not null`))),
		suspended: await n(db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.status, 'suspended'))),
		openCalls: await n(db.select({ n: sql<number>`count(*)` }).from(calls).where(eq(calls.status, 'live'))),
		requestsToday: await n(db.select({ n: sql<number>`count(*)` }).from(bloodRequests).where(sql`${bloodRequests.createdAt} >= ${todayStart}`)),
	}
}
export const oldestQueue = (db: Db, limit: number) => db.select({ id: facilities.id, name: facilities.name, town: facilities.town, status: facilities.status, submittedAt: facilities.submittedAt }).from(facilities).where(inArray(facilities.status, ['pending', 'needs_info'])).orderBy(asc(facilities.submittedAt)).limit(limit)
