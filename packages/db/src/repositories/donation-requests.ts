import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../client'
import { donationRequests, facilities } from '../schema'

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
		.set({ status: 'cancelled', updatedAt: at })
		.where(and(eq(donationRequests.id, id), eq(donationRequests.userId, userId), inArray(donationRequests.status, ['requested', 'scheduled'])))
	return res.affectedRows === 1
}
