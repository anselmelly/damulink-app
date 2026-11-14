import { z } from 'zod'
import { BLOOD_TYPES } from './auth'

export const REQUEST_RELATIONS = ['family', 'friend', 'colleague', 'community', 'other'] as const
export const REQUEST_STATUSES = ['pending', 'needs_info', 'confirmed', 'approved', 'published', 'closed', 'rejected', 'cancelled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
/** A request that still counts against "one open request per patient" and the requester's open list. */
export const OPEN_STATUSES: readonly RequestStatus[] = ['pending', 'needs_info', 'confirmed', 'approved', 'published']
export const REJECT_REASONS = ['no_match', 'already_given', 'requirements', 'other'] as const
export const URGENCIES = ['normal', 'urgent', 'surge'] as const

/** Draft limits; the super admin edits them later through settings rows. */
export const REQUEST_DEFAULTS = { dailyCap: 3, maxUnits: 10, maxDaysAhead: 30 }

export const formatRequestNumber = (n: number) => `REQ-${String(n).padStart(4, '0')}`
/** "Ward 4, bed 12" and "ward 4 bed 12" are the same patient. */
export const patientKey = (ref: string) => ref.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** The only legal moves. Everything that changes a request's status goes through this table. */
export type RequestAction = 'confirm' | 'ask' | 'approve' | 'reject' | 'reply' | 'cancel'
export const REQUEST_MOVES: Record<RequestAction, { from: readonly RequestStatus[]; to: RequestStatus }> = {
	confirm: { from: ['pending'], to: 'confirmed' },
	ask: { from: ['pending', 'confirmed'], to: 'needs_info' },
	approve: { from: ['confirmed'], to: 'approved' },
	reject: { from: ['pending', 'confirmed'], to: 'rejected' },
	reply: { from: ['needs_info'], to: 'pending' },
	cancel: { from: ['pending', 'needs_info', 'confirmed', 'approved'], to: 'cancelled' },
}

const when = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a date and time')
const text = (max: number) => z.string().trim().max(max)
const units = z.number().int().min(1, 'Ask for at least 1 unit').max(REQUEST_DEFAULTS.maxUnits, `At most ${REQUEST_DEFAULTS.maxUnits} units`)

/** A person asks a facility for blood for a patient. */
export const requestInput = z.object({
	facilityId: z.string().length(26, 'Choose a facility'),
	patientRef: text(120).min(1, 'Enter the ward and bed, or the patient number'),
	patientName: text(120).optional(),
	relation: z.enum(REQUEST_RELATIONS, { errorMap: () => ({ message: 'Choose your relationship to the patient' }) }),
	bloodType: z.enum([...BLOOD_TYPES, 'unsure'], { errorMap: () => ({ message: 'Choose a blood type or "not sure"' }) }),
	units,
	neededBy: when,
	urgency: z.enum(['normal', 'urgent']),
	note: text(300).optional(),
	genuine: z.literal(true, { errorMap: () => ({ message: 'Please confirm this request is genuine' }) }),
})
export type RequestInput = z.infer<typeof requestInput>

/** A facility raises a request for its own patient (no approval step). */
export const raiseInput = z.object({
	patientRef: text(120).min(1, 'Enter the ward and bed, or the patient number'),
	patientName: text(120).optional(),
	bloodType: z.enum(BLOOD_TYPES),
	units,
	urgency: z.enum(URGENCIES),
	neededBy: when,
	internalNote: text(500).optional(),
})
export type RaiseInput = z.infer<typeof raiseInput>

export const confirmInput = z.object({ bloodType: z.enum(BLOOD_TYPES), units, urgency: z.enum(URGENCIES) })
export const askInput = z.object({ question: text(500).min(1, 'Write your question') })
export const rejectInput = z.object({ reason: z.enum(REJECT_REASONS), message: text(500).optional() })
export const cancelInput = z.object({ reason: text(200).optional() })
export const replyInput = z.object({ message: text(500).min(1, 'Write your reply') })
export const permissionInput = z.object({ canApprove: z.boolean() })

// ---------- what the screens receive
export type RequestEventView = { kind: string; text: string | null; at: string; by?: string | null }
export type RequestSummary = { id: string; number: string; status: RequestStatus; facilityName: string; facilityTown: string; bloodType: string; units: number; neededBy: string; createdAt: string }
export type RequestDetail = {
	id: string
	number: string
	status: RequestStatus
	facility: { id: string; name: string; town: string }
	patientRef: string
	patientName: string | null
	relation: string | null
	bloodTypeAsked: string
	unitsAsked: number
	urgencyAsked: string
	neededBy: string
	note: string | null
	blood: { bloodType: string; units: number; urgency: string } | null
	question: string | null
	rejectReason: string | null
	rejectMessage: string | null
	timeline: RequestEventView[]
	createdAt: string
}
export type FacilityRequestItem = { id: string; number: string; status: RequestStatus; source: 'public' | 'facility'; patientRef: string; bloodType: string; units: number; urgency: string; neededBy: string; requesterName: string | null; createdAt: string }
export type FacilityRequestList = { counts: Partial<Record<RequestStatus, number>>; items: FacilityRequestItem[] }
export type FacilityRequestDetail = Omit<RequestDetail, 'facility'> & {
	source: 'public' | 'facility'
	internalNote: string | null
	requester: { name: string; phone: string; total: number; rejected: number; cancelled: number } | null
	canDecide: boolean
}
