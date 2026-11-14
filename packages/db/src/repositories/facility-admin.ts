import { and, asc, desc, eq, inArray, isNotNull, like, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { facilities, facilityEvents, facilityMembers, users } from '../schema'

export type Facility = typeof facilities.$inferSelect
export type FacilityEvent = typeof facilityEvents.$inferSelect

export async function facilityCodeExists(db: Db, code: string): Promise<boolean> {
	const [r] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.facilityCode, code)).limit(1)
	return !!r
}

/** Creates the facility, makes the applicant its admin and records "submitted", all or nothing. */
export async function createFacility(db: Db, f: typeof facilities.$inferInsert, member: { userId: string; roleTitle: string }, event: typeof facilityEvents.$inferInsert): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.insert(facilities).values(f)
		await tx.insert(facilityMembers).values({ facilityId: f.id, userId: member.userId, role: 'admin', roleTitle: member.roleTitle, createdAt: event.createdAt })
		await tx.insert(facilityEvents).values(event)
	})
}

export async function getFacility(db: Db, id: string): Promise<Facility | undefined> {
	const [f] = await db.select().from(facilities).where(eq(facilities.id, id)).limit(1)
	return f
}

export async function updateFacility(db: Db, id: string, changes: Partial<typeof facilities.$inferInsert>): Promise<void> {
	await db.update(facilities).set(changes).where(eq(facilities.id, id))
}

export async function addFacilityEvent(db: Db, e: typeof facilityEvents.$inferInsert): Promise<void> {
	await db.insert(facilityEvents).values(e)
}

export async function listFacilityEvents(db: Db, facilityId: string, visibleOnly: boolean) {
	return db
		.select({ e: facilityEvents, byName: users.name })
		.from(facilityEvents)
		.leftJoin(users, eq(users.id, facilityEvents.actorId))
		.where(and(eq(facilityEvents.facilityId, facilityId), visibleOnly ? eq(facilityEvents.visible, true) : undefined))
		.orderBy(asc(facilityEvents.createdAt), asc(facilityEvents.id))
}

export async function getMembership(db: Db, facilityId: string, userId: string) {
	const [m] = await db.select().from(facilityMembers).where(and(eq(facilityMembers.facilityId, facilityId), eq(facilityMembers.userId, userId))).limit(1)
	return m
}

/** Facilities a person runs or works at, newest first, whatever their status. */
export async function listMemberFacilities(db: Db, userId: string) {
	return db
		.select({ f: facilities, role: facilityMembers.role })
		.from(facilityMembers)
		.innerJoin(facilities, eq(facilities.id, facilityMembers.facilityId))
		.where(eq(facilityMembers.userId, userId))
		.orderBy(desc(facilities.submittedAt), desc(facilities.id))
}

/** License numbers that more than one facility uses. */
export async function sharedLicenses(db: Db): Promise<Set<string>> {
	const rows = await db
		.select({ l: facilities.licenseNumber })
		.from(facilities)
		.where(isNotNull(facilities.licenseNumber))
		.groupBy(facilities.licenseNumber)
		.having(sql`count(*) > 1`)
	return new Set(rows.map((r) => r.l!))
}

export async function adminListFacilities(db: Db, o: { queueOnly: boolean; status?: string; q?: string }): Promise<Facility[]> {
	const term = o.q?.trim() ? `%${o.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null
	return db
		.select()
		.from(facilities)
		.where(
			and(
				o.queueOnly ? inArray(facilities.status, ['pending', 'needs_info']) : undefined,
				o.status ? eq(facilities.status, o.status as Facility['status']) : undefined,
				term ? or(like(facilities.name, term), like(facilities.town, term), like(facilities.county, term), like(facilities.licenseNumber, term)) : undefined,
			),
		)
		.orderBy(o.queueOnly ? asc(facilities.submittedAt) : asc(facilities.name), asc(facilities.id))
}

export async function facilitiesWithLicense(db: Db, license: string, exceptId: string): Promise<Facility[]> {
	return db.select().from(facilities).where(and(eq(facilities.licenseNumber, license), ne(facilities.id, exceptId)))
}

/** The person who submitted the facility (its first admin). */
export async function applicantOf(db: Db, f: Pick<Facility, 'id' | 'createdBy'>) {
	if (!f.createdBy) return undefined
	const [row] = await db
		.select({ u: users, roleTitle: facilityMembers.roleTitle })
		.from(users)
		.leftJoin(facilityMembers, and(eq(facilityMembers.userId, users.id), eq(facilityMembers.facilityId, f.id)))
		.where(eq(users.id, f.createdBy))
		.limit(1)
	return row
}
