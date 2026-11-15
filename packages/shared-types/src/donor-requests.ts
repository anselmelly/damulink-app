import { z } from 'zod'

/** Why a facility turned down or cancelled a visit. A fixed list, so no health reason is ever typed in. */
export const DECLINE_REASONS = {
	no_capacity: 'We cannot take donations on that day',
	other_facility: 'Please choose another medical facility',
	waiting_period: 'Please come back after your waiting period',
	other: 'Other',
} as const
export type DeclineReason = keyof typeof DECLINE_REASONS

export const declineInput = z
	.object({ reason: z.enum(['no_capacity', 'other_facility', 'waiting_period', 'other'], { errorMap: () => ({ message: 'Choose a reason' }) }), note: z.string().trim().max(200).optional() })
	.refine((v) => v.reason !== 'other' || !!v.note, { path: ['note'], message: 'Add a short note' })

export const scheduleVisitInput = z.object({ scheduledAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a date and time') })

export const DONOR_REQUEST_DEFAULTS = { maxDaysAhead: 60, busyHour: 8 }
export const REQUEST_TABS = ['follow_up', 'scheduled', 'past'] as const
export type RequestTab = (typeof REQUEST_TABS)[number]

export type DonorRequestItem = {
	id: string
	kind: 'test' | 'donate'
	status: 'requested' | 'scheduled' | 'completed' | 'cancelled' | 'no_show'
	name: string
	code: string
	verified: boolean
	days: string[]
	timeOfDay: 'morning' | 'afternoon' | 'any'
	askedAt: string
	scheduledAt: string | null
	rescheduleAsked: boolean
	cancelledBy: 'donor' | 'facility' | null
	cancelReason: string | null
	/** One line, donations only: "Likely eligible" or "Waiting period until ...". No health detail. */
	note: string | null
}
export type DonorRequestList = { tab: RequestTab; items: DonorRequestItem[]; counts: Record<RequestTab, number> }
