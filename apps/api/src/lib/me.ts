import { userFacilities, type Db, type User } from '@damu/db'
import { checkEligibility, maskPhone, type MeResponse } from '@damu/shared-types'
import { getEligibilitySettings } from './eligibility'
import { managedFacilities } from './facilities'

export async function toMe(db: Db, u: User, now: Date): Promise<MeResponse> {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		phone: maskPhone(u.phone),
		sex: u.sex,
		dateOfBirth: u.dateOfBirth,
		emailVerified: !!u.emailVerifiedAt,
		phoneVerified: !!u.phoneVerifiedAt,
		canDonate: !!u.donorCode, // 18 or over at signup
		donorCode: u.donorCode,
		isSuperAdmin: u.isSuperAdmin,
		facilities: await userFacilities(db, u),
		managedFacilities: await managedFacilities(db, u.id),
		donorStatus: u.bloodType ? 'verified' : 'registered',
		bloodType: u.bloodType,
		eligibility: checkEligibility({ sex: u.sex, dateOfBirth: u.dateOfBirth, today: now.toISOString().slice(0, 10), lastDonationOn: u.lastDonationOn, weightKg: u.weightKg, settings: await getEligibilitySettings(db) }),
	}
}

/** 18 or over on `today` (UTC date), compared as dates so the birthday itself counts. */
export function isAdult(dateOfBirth: string, today: Date): boolean {
	const cutoff = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10)
	return dateOfBirth <= cutoff
}

/** A real calendar date in the past, not before 1900. Returns the message to show, or null when fine. */
export function badBirthDate(dateOfBirth: string, now: Date): string | null {
	const d = new Date(`${dateOfBirth}T00:00:00Z`)
	if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateOfBirth || d > now || d.getUTCFullYear() < 1900) return 'Enter a real date of birth'
	return null
}
