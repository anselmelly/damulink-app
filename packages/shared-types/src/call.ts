import { z } from 'zod'
import { BLOOD_TYPES } from './auth'
import { URGENCIES, type RequestStatus } from './request'

/** Draft limits; the super admin edits them later through settings rows. */
export const CALL_DEFAULTS = { textMax: 140, baseDays: 3, maxDays: 7, extendStepMax: 3 }
export const CALL_STATUSES = ['live', 'closed', 'expired', 'taken_down'] as const
export type CallStatus = (typeof CALL_STATUSES)[number]
export const CLOSE_REASONS = ['covered', 'not_needed', 'cancelled'] as const
export const RESPONSE_STATUSES = ['willing', 'scheduled', 'donated', 'not_needed'] as const
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number]

export const formatCallNumber = (n: number) => `CALL-${String(n).padStart(4, '0')}`
/** Accepts "CALL-0187" in any case; returns the number or null. */
export const parseCallNumber = (s: string): number | null => {
	const m = s.match(/^call-0*(\d+)$/i)
	return m ? Number(m[1]) : null
}

/** Who can give blood to a patient of this type (red cell compatibility). */
const GIVES_TO: Record<string, readonly string[]> = {
	'O-': BLOOD_TYPES,
	'O+': ['O+', 'A+', 'B+', 'AB+'],
	'A-': ['A-', 'A+', 'AB-', 'AB+'],
	'A+': ['A+', 'AB+'],
	'B-': ['B-', 'B+', 'AB-', 'AB+'],
	'B+': ['B+', 'AB+'],
	'AB-': ['AB-', 'AB+'],
	'AB+': ['AB+'],
}
export const compatibleTypes = (patient: string): string[] => BLOOD_TYPES.filter((d) => GIVES_TO[d]?.includes(patient))

export const suggestedCallText = (bloodType: string) => `We are appealing for ${bloodType} blood. Please share this call.`

/** The public text must not carry the patient's name, ward or bed. Returns the message to show, or null when fine. */
export function publicTextProblem(text: string, p: { patientName?: string | null; patientRef?: string | null }, max: number = CALL_DEFAULTS.textMax): string | null {
	const t = text.trim()
	if (!t) return 'Write the text people will read'
	if (t.length > max) return `Keep it to ${max} characters`
	const low = t.toLowerCase()
	for (const w of (p.patientName ?? '').toLowerCase().split(/[^a-z0-9']+/)) if (w.length >= 2 && new RegExp(`\\b${w.replace(/[^a-z0-9]/g, '')}\\b`).test(low)) return "Leave out the patient's name"
	if (/\b(ward|bed|room|cubicle)\s*(no\.?\s*)?[a-z]?\d+/i.test(t)) return 'Leave out the ward and bed'
	const ref = (p.patientRef ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
	if (ref.length >= 3 && low.replace(/[^a-z0-9]+/g, ' ').includes(ref)) return 'Leave out the ward and bed'
	return null
}

const types = z.array(z.enum(BLOOD_TYPES)).min(1, 'Choose at least one blood type').max(8)
export const publishInput = z.object({
	types,
	urgency: z.enum(URGENCIES),
	publicText: z.string().trim().max(500),
	isPublic: z.boolean(),
	smsEnabled: z.boolean(),
})
export const callEditInput = z.object({ types: types.optional(), publicText: z.string().trim().max(500).optional() })
export const extendInput = z.object({ days: z.number().int().min(1, 'Choose 1, 2 or 3 days').max(CALL_DEFAULTS.extendStepMax, 'Choose 1, 2 or 3 days') })
export const closeInput = z.object({ reason: z.enum(CLOSE_REASONS, { errorMap: () => ({ message: 'Choose a reason' }) }) })
export const scheduleInput = z.object({ scheduledAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a date and time') })

// ---------- what the screens receive
export type CallBrief = { id: string; number: string; short: string; status: CallStatus; closesAt: string; units: number; covered: number }
export type PublishPreview = { compatibleTypes: string[]; suggestedText: string; textMax: number; urgency: string; bloodType: string; units: number; facilityName: string; facilityTown: string }
export type CallItem = { id: string; number: string; short: string; status: CallStatus; urgency: string; bloodType: string; requestId: string; requestNumber: string; publishedAt: string; closesAt: string; stillNeeded: number; yes: number }
export type CallResponseView = { id: string; name: string; phone: string; bloodType: string | null; ring: number; status: ResponseStatus; repliedAt: string; scheduledAt: string | null }
export type CallUnits = { needed: number; donated: number; scheduled: number; stillNeeded: number }
export type CallDetail = {
	id: string
	number: string
	short: string
	status: CallStatus
	urgency: string
	bloodType: string
	types: string[]
	publicText: string
	isPublic: boolean
	smsEnabled: boolean
	publishedAt: string
	closesAt: string
	extendedDays: number
	canExtendDays: number
	closedAt: string | null
	closeReason: string | null
	request: { id: string; number: string; patientRef: string; status: RequestStatus }
	units: CallUnits
	responses: CallResponseView[]
}
export type PublicCall = {
	code: string
	short: string
	status: CallStatus
	bloodType: string
	types: string[]
	urgency: string
	publicText: string
	publishedAt: string
	closesAt: string
	facility: { name: string; town: string; county: string }
}
export type PublicCallList = { items: PublicCall[] }
