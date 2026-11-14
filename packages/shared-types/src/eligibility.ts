/** Every value here is a setting (the super admin edits them later); these are the draft defaults, still to confirm with the national blood service. */
export type EligibilitySettings = { minAge: number; maxAge: number; minWeightKg: number; waitingMonthsMale: number; waitingMonthsFemale: number }
export const DEFAULT_ELIGIBILITY: EligibilitySettings = { minAge: 18, maxAge: 65, minWeightKg: 50, waitingMonthsMale: 3, waitingMonthsFemale: 4 }

export type Eligibility = {
	/** `eligible`: likely able to donate today. `waiting`: gave recently. `too_young` / `too_old`: outside the age range. */
	status: 'eligible' | 'waiting' | 'too_young' | 'too_old'
	/** For `waiting` the day they can donate again; for `too_young` the day they turn the minimum age. */
	eligibleOn?: string
	/** A recorded weight under the limit only warns: the facility decides on the day. */
	weightAdvisory?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const parts = (d: string) => d.split('-').map(Number) as [number, number, number]
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m is 1-12

/** Adds calendar months to a YYYY-MM-DD date; a day that does not exist in the target month moves to its last day. */
export function addMonths(date: string, months: number): string {
	const [y, m, d] = parts(date)
	const total = y * 12 + (m - 1) + months
	const ny = Math.floor(total / 12)
	const nm = (total % 12) + 1
	return `${ny}-${pad(nm)}-${pad(Math.min(d, daysIn(ny, nm)))}`
}

/** "Likely eligible": the facility's own screening on the day always has the final say. Dates are plain YYYY-MM-DD strings (UTC), so they compare as text. */
export function checkEligibility(i: {
	sex: 'female' | 'male'
	dateOfBirth: string
	today: string
	lastDonationOn?: string | null
	weightKg?: number | null
	settings?: EligibilitySettings
}): Eligibility {
	const s = i.settings ?? DEFAULT_ELIGIBILITY
	const turnsMin = addMonths(i.dateOfBirth, s.minAge * 12)
	if (turnsMin > i.today) return { status: 'too_young', eligibleOn: turnsMin }
	// "65" means eligible through the day before the 66th birthday
	if (addMonths(i.dateOfBirth, (s.maxAge + 1) * 12) <= i.today) return { status: 'too_old' }
	const weightAdvisory = i.weightKg != null && i.weightKg < s.minWeightKg
	if (i.lastDonationOn) {
		const again = addMonths(i.lastDonationOn, i.sex === 'male' ? s.waitingMonthsMale : s.waitingMonthsFemale)
		if (again > i.today) return { status: 'waiting', eligibleOn: again, weightAdvisory }
	}
	return { status: 'eligible', weightAdvisory }
}
