import { userFacilities, type Db, type User } from '@damu/db'
import { maskPhone, type MeResponse } from '@damu/shared-types'

export async function toMe(db: Db, u: User, canDonate: boolean): Promise<MeResponse> {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		phone: maskPhone(u.phone),
		emailVerified: !!u.emailVerifiedAt,
		phoneVerified: !!u.phoneVerifiedAt,
		canDonate,
		donorCode: u.donorCode,
		isSuperAdmin: u.isSuperAdmin,
		facilities: await userFacilities(db, u),
	}
}

/** 18 or over on `today` (UTC date), compared as dates so the birthday itself counts. */
export function isAdult(dateOfBirth: string, today: Date): boolean {
	const cutoff = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10)
	return dateOfBirth <= cutoff
}
