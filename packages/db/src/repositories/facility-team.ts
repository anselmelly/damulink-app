import { and, asc, count, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { facilities, facilityInvites, facilityMembers, users } from '../schema'

export type Invite = typeof facilityInvites.$inferSelect

export async function slugExists(db: Db, slug: string): Promise<boolean> {
	const [r] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.slug, slug)).limit(1)
	return !!r
}

/** The public face of a verified facility; anything else is "not found". */
export async function getVerifiedBySlug(db: Db, slug: string) {
	const [f] = await db.select({ id: facilities.id, name: facilities.name, town: facilities.town, county: facilities.county }).from(facilities).where(and(eq(facilities.slug, slug), eq(facilities.status, 'verified'))).limit(1)
	return f
}

export async function getFacilityByCode(db: Db, code: string) {
	const [f] = await db.select().from(facilities).where(eq(facilities.facilityCode, code)).limit(1)
	return f
}

// ---------- members
export async function listMembers(db: Db, facilityId: string) {
	return db
		.select({ userId: users.id, name: users.name, email: users.email, role: facilityMembers.role, canApprove: facilityMembers.canApprove, since: facilityMembers.createdAt })
		.from(facilityMembers)
		.innerJoin(users, eq(users.id, facilityMembers.userId))
		.where(eq(facilityMembers.facilityId, facilityId))
		.orderBy(asc(facilityMembers.createdAt), asc(users.id))
}
export async function addMember(db: Db, m: typeof facilityMembers.$inferInsert): Promise<void> {
	await db.insert(facilityMembers).values(m).onDuplicateKeyUpdate({ set: { role: m.role } })
}
export async function setMemberRole(db: Db, facilityId: string, userId: string, role: 'admin' | 'attendant'): Promise<void> {
	await db.update(facilityMembers).set({ role }).where(and(eq(facilityMembers.facilityId, facilityId), eq(facilityMembers.userId, userId)))
}
export async function removeMember(db: Db, facilityId: string, userId: string): Promise<void> {
	await db.delete(facilityMembers).where(and(eq(facilityMembers.facilityId, facilityId), eq(facilityMembers.userId, userId)))
}
export async function setMemberTitle(db: Db, facilityId: string, userId: string, roleTitle: string): Promise<void> {
	await db.update(facilityMembers).set({ roleTitle }).where(and(eq(facilityMembers.facilityId, facilityId), eq(facilityMembers.userId, userId)))
}
export async function countAdmins(db: Db, facilityId: string): Promise<number> {
	const [r] = await db.select({ n: count() }).from(facilityMembers).where(and(eq(facilityMembers.facilityId, facilityId), eq(facilityMembers.role, 'admin')))
	return Number(r.n)
}

// ---------- invites
/** Cancels any earlier open invite for the same person, then stores the new one. */
export async function createInvite(db: Db, i: typeof facilityInvites.$inferInsert): Promise<void> {
	await db.update(facilityInvites).set({ revokedAt: i.createdAt }).where(and(eq(facilityInvites.facilityId, i.facilityId), eq(facilityInvites.email, i.email), isNull(facilityInvites.acceptedAt), isNull(facilityInvites.revokedAt)))
	await db.insert(facilityInvites).values(i)
}
/** An invite that can still be used: not accepted, not revoked, not expired. */
export async function findOpenInvite(db: Db, tokenHash: string, now: Date): Promise<Invite | undefined> {
	const [i] = await db.select().from(facilityInvites).where(and(eq(facilityInvites.tokenHash, tokenHash), isNull(facilityInvites.acceptedAt), isNull(facilityInvites.revokedAt), gt(facilityInvites.expiresAt, now))).limit(1)
	return i
}
export async function listOpenInvites(db: Db, facilityId: string, now: Date): Promise<Invite[]> {
	return db.select().from(facilityInvites).where(and(eq(facilityInvites.facilityId, facilityId), isNull(facilityInvites.acceptedAt), isNull(facilityInvites.revokedAt), gt(facilityInvites.expiresAt, now))).orderBy(asc(facilityInvites.createdAt))
}
export async function revokeInvite(db: Db, id: string, facilityId: string, at: Date): Promise<boolean> {
	const [res] = await db.update(facilityInvites).set({ revokedAt: at }).where(and(eq(facilityInvites.id, id), eq(facilityInvites.facilityId, facilityId), isNull(facilityInvites.acceptedAt), isNull(facilityInvites.revokedAt)))
	return res.affectedRows === 1
}
/** True only for the first caller. */
export async function acceptInvite(db: Db, id: string, at: Date): Promise<boolean> {
	const [res] = await db.update(facilityInvites).set({ acceptedAt: at }).where(and(eq(facilityInvites.id, id), isNull(facilityInvites.acceptedAt), isNull(facilityInvites.revokedAt)))
	return res.affectedRows === 1
}

// ---------- numbers for the admin
export async function donorStats(db: Db, facilityId: string) {
	const [r] = await db
		.select({
			total: count(),
			verified: sql<number>`sum(case when ${users.bloodType} is not null then 1 else 0 end)`,
		})
		.from(users)
		.where(and(eq(users.homeFacilityId, facilityId), isNotNull(users.donorCode)))
	const total = Number(r.total)
	const verified = Number(r.verified ?? 0)
	return { homeDonors: total, verifiedDonors: verified, registeredDonors: total - verified }
}

export async function setMemberCanApprove(db: Db, facilityId: string, userId: string, canApprove: boolean): Promise<void> {
	await db.update(facilityMembers).set({ canApprove }).where(and(eq(facilityMembers.facilityId, facilityId), eq(facilityMembers.userId, userId)))
}
