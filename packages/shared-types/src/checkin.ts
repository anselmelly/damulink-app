import { z } from 'zod'
import { BLOOD_TYPES } from './auth'
import type { Eligibility } from './eligibility'

/** "dl 3f8p 6a", "DL3F8P6A" and "DL-3F8P-6A" are the same code. Anything that is not 8 letters and digits comes back upper-cased and untouched. */
export function normalizeDonorCode(raw: string): string {
	const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
	return s.length === 8 ? `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}` : raw.trim().toUpperCase()
}

export const CHECKIN_DEFAULTS = { lookupsPer10Min: 30, pauseMaxMonths: 12 }
export const VISIT_KINDS = ['donated', 'test', 'deferred', 'no_show'] as const
export type VisitKind = (typeof VISIT_KINDS)[number]

const weight = z.number().min(20, 'Check the weight').max(300, 'Check the weight').optional()
const bag = z.string().trim().max(40).optional()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')

/** What happened at the desk. A weight is always optional: under 50 kg only warns, the facility decides. */
export const outcomeInput = z.discriminatedUnion('outcome', [
	z.object({ outcome: z.literal('donated'), weightKg: weight, bagNumber: bag, callId: z.string().max(26).optional() }),
	z.object({ outcome: z.literal('test'), weightKg: weight, bloodType: z.enum([...BLOOD_TYPES, 'later']) }),
	z.object({ outcome: z.literal('deferred'), returnAfter: day.optional() }),
	z.object({ outcome: z.literal('no_show') }),
])
export type OutcomeInput = z.infer<typeof outcomeInput>

export const labResultInput = z.object({ bloodType: z.enum(BLOOD_TYPES, { errorMap: () => ({ message: 'Choose a blood type' }) }) })

export const walkinInput = z.object({
	name: z.string().trim().min(2, 'Enter the full name').max(100),
	sex: z.enum(['female', 'male']),
	dateOfBirth: day,
	weightKg: weight,
	bloodType: z.enum(BLOOD_TYPES).optional(),
	outcome: z.enum(['donated', 'test', 'deferred']),
	bagNumber: bag,
	invitePhone: z.string().trim().max(20).optional(),
})
export type WalkinInput = z.infer<typeof walkinInput>

// ---------- what the screens receive
export type EligibilityCheck = { key: 'age' | 'weight' | 'waiting'; ok: boolean; advisory?: boolean; text: string }
export type CheckinCard = {
	code: string
	name: string
	sex: 'female' | 'male'
	age: number
	verified: boolean
	bloodType: string | null
	weightKg: number | null
	lastDonationOn: string | null
	donations: number
	eligibility: Eligibility
	checks: EligibilityCheck[]
	calls: { id: string; number: string; bloodType: string; needed: number }[]
	appointment: { id: string; kind: 'test' | 'donate'; scheduledAt: string } | null
}
export type OutcomeResult = {
	outcome: VisitKind
	nextEligibleOn?: string
	warning?: 'weight_low'
	verified?: boolean
	call?: { number: string; donated: number; needed: number }
}
export type LabSampleItem = { id: string; name: string; code: string; source: 'donation' | 'test'; on: string; sampleRef: string }
