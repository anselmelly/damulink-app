import { eq } from 'drizzle-orm'
import type { Db } from '../client'
import { authTokens, donationRequests, donorPrefs, facilityRequests, phoneOtps, refreshTokens, userExtraFacilities, users } from '../schema'

const NOBODY = '0'.repeat(26)

/**
 * Removes a donor and everything tied to them in one step. The "my facility is not listed" lines stay as anonymous demand
 * (the name of the place is not personal data), pointing at nobody.
 */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.update(facilityRequests).set({ userId: NOBODY }).where(eq(facilityRequests.userId, userId))
		for (const t of [refreshTokens, authTokens, phoneOtps, donationRequests, donorPrefs, userExtraFacilities]) await tx.delete(t).where(eq(t.userId, userId))
		await tx.delete(users).where(eq(users.id, userId))
	})
}
