import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../client'
import { facilities, facilityRequests, userExtraFacilities, users } from '../schema'

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export async function findUserByEmail(db: Db, email: string): Promise<User | undefined> {
	const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1)
	return u
}
export async function findUserByPhone(db: Db, phone: string): Promise<User | undefined> {
	const [u] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
	return u
}
export async function findUserById(db: Db, id: string): Promise<User | undefined> {
	const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1)
	return u
}

export async function donorCodeExists(db: Db, code: string): Promise<boolean> {
	const [u] = await db.select({ id: users.id }).from(users).where(eq(users.donorCode, code)).limit(1)
	return !!u
}

/** Creates the user and its facility links in one transaction. */
export async function createUser(db: Db, u: NewUser, extraFacilityIds: string[], unlistedRequest: { id: string; name: string } | null): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.insert(users).values(u)
		if (extraFacilityIds.length) await tx.insert(userExtraFacilities).values(extraFacilityIds.map((facilityId) => ({ userId: u.id, facilityId })))
		if (unlistedRequest) await tx.insert(facilityRequests).values({ id: unlistedRequest.id, name: unlistedRequest.name, userId: u.id, createdAt: u.createdAt })
	})
}

export async function touchLogin(db: Db, id: string, at: Date): Promise<void> {
	await db.update(users).set({ lastLoginAt: at }).where(eq(users.id, id))
}

/** The facilities a user is linked to (home first, then the extra ones). */
export async function userFacilities(db: Db, u: Pick<User, 'id' | 'homeFacilityId'>): Promise<{ id: string; name: string }[]> {
	const extra = await db.select({ facilityId: userExtraFacilities.facilityId }).from(userExtraFacilities).where(eq(userExtraFacilities.userId, u.id))
	const ids = [...(u.homeFacilityId ? [u.homeFacilityId] : []), ...extra.map((e) => e.facilityId)]
	if (!ids.length) return []
	const rows = await db.select({ id: facilities.id, name: facilities.name }).from(facilities).where(and(inArray(facilities.id, ids)))
	return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is { id: string; name: string } => !!r)
}

export async function setDonorCode(db: Db, userId: string, code: string): Promise<void> {
	await db.update(users).set({ donorCode: code }).where(eq(users.id, userId))
}

export async function updateUser(db: Db, id: string, changes: Partial<typeof users.$inferInsert>): Promise<void> {
	if (Object.keys(changes).length) await db.update(users).set(changes).where(eq(users.id, id))
}

/** Replaces the home facility and the extra ones in one step. */
export async function replaceFacilities(db: Db, userId: string, home: string | null, extras: string[]): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.update(users).set({ homeFacilityId: home }).where(eq(users.id, userId))
		await tx.delete(userExtraFacilities).where(eq(userExtraFacilities.userId, userId))
		if (extras.length) await tx.insert(userExtraFacilities).values(extras.map((facilityId) => ({ userId, facilityId })))
	})
}

export async function insertFacilityRequest(db: Db, r: typeof facilityRequests.$inferInsert): Promise<void> {
	await db.insert(facilityRequests).values(r)
}
