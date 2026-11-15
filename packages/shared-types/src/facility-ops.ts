import { z } from 'zod'
import { BLOOD_TYPES } from './auth'

export const CORRECTION_REASONS = { lab_differed: 'Lab result differed', typo: 'Typing mistake', wrong_donor: 'Wrong donor selected', reweighed: 'Weight re-measured', other: 'Other' } as const
export type CorrectionReason = keyof typeof CORRECTION_REASONS
export const CORRECTION_DEFAULTS = { attendantHours: 24, donorsPageSize: 25, lookupsPer10Min: 60 }

/** At least one of the three values; a reason from the list; an optional short note. */
export const correctionInput = z
	.object({
		bloodType: z.enum(BLOOD_TYPES).optional(),
		weightKg: z.number().min(20, 'Check the weight').max(300, 'Check the weight').optional(),
		lastDonationOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date').optional(),
		reason: z.enum(['lab_differed', 'typo', 'wrong_donor', 'reweighed', 'other'], { errorMap: () => ({ message: 'Choose a reason' }) }),
		note: z.string().trim().max(200).optional(),
	})
	.refine((v) => v.bloodType !== undefined || v.weightKg !== undefined || v.lastDonationOn !== undefined, { path: ['bloodType'], message: 'Change at least one value' })

export type CorrectionLogItem = { id: string; field: 'blood_type' | 'weight' | 'last_donation'; oldValue: string | null; newValue: string; reason: CorrectionReason; note: string | null; by: string; at: string }
export type RecordView = {
	name: string
	code: string
	bloodType: string | null
	weightKg: number | null
	lastDonationOn: string | null
	/** What this facility made and may correct. */
	own: { bloodType: boolean; donation: boolean }
	/** True when the record is older than the attendant window and the caller is not an admin. */
	locked: boolean
	log: CorrectionLogItem[]
}

export type DonorListItem = { name: string; code: string; bloodType: string | null; verified: boolean; lastDonationOn: string | null; eligibility: string; alertsOn: boolean; suspended: boolean }
export type DonorsList = { items: DonorListItem[]; total: number; page: number; pageSize: number; counts: { all: number; verified: number; registered: number; alertsOn: number } }

export type FacilityHome = {
	counts: { toReview: number; activeCalls: number; followUp: number; visitsToday: number; labWaiting: number }
	waiting: { id: string; number: string; bloodType: string; units: number; urgency: string; ref: string; at: string }[]
	calls: { id: string; number: string; bloodType: string; yes: number; donated: number; scheduled: number; needed: number }[]
	visits: { id: string; at: string; name: string; kind: 'donate' | 'test'; checkedIn: boolean }[]
}
