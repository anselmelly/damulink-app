import type { RequestStatus } from '@damu/shared-types'

/** Badge class and label for each request status (the requester's words and the facility's are the same). */
export const REQUEST_STATUS: Record<RequestStatus, [string, string]> = {
	pending: ['badge-warn', 'Pending'],
	needs_info: ['badge-warn', 'More information needed'],
	confirmed: ['badge-soft', 'Confirmed offline'],
	approved: ['badge-ok', 'Approved'],
	published: ['badge-ok', 'Published'],
	closed: ['badge-neutral', 'Closed'],
	rejected: ['badge bg-red-100 text-red-800', 'Not approved'],
	cancelled: ['badge-neutral', 'Cancelled'],
}

export const RELATIONS: [string, string][] = [
	['family', 'Family member'],
	['friend', 'Friend'],
	['colleague', 'Colleague'],
	['community', 'Community or church member'],
	['other', 'Other'],
]
export const relationLabel = (v: string | null) => RELATIONS.find(([k]) => k === v)?.[1] ?? '—'

/** What the facility chose when rejecting, in words the requester can read. */
export const REJECT_REASON_TEXT: Record<string, string> = {
	no_match: 'We could not match this request to a patient on the ward.',
	already_given: 'The patient has already been given blood.',
	requirements: 'The request does not meet our requirements.',
	other: 'The facility could not approve this request.',
}
/** The same choices as they appear in the facility's reject form. */
export const REJECT_CHOICES: [string, string][] = [
	['no_match', 'We could not match this to a patient on the ward'],
	['already_given', 'The patient has already been given blood'],
	['requirements', 'The request does not meet our requirements'],
	['other', 'Other'],
]

export const BLOOD_CHOICES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "20 min", "3 hours", "Yesterday", "2 days ago" — how long ago, for the attendant's queue. */
export function ago(iso: string, now = Date.now()): string {
	const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
	if (mins < 60) return `${Math.max(mins, 1)} min`
	const hours = Math.round(mins / 60)
	if (hours < 24) return plural(hours, 'hour')
	const days = Math.round(hours / 24)
	return days === 1 ? 'Yesterday' : `${days} days ago`
}

/** Fri 6 Nov, 18:00 in Nairobi. */
export const neededAt = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
export const sentAt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })

/** A date box and a time box (Nairobi time) become one ISO moment. */
export const toIso = (date: string, time: string) => (date && time ? new Date(`${date}T${time}:00+03:00`).toISOString() : '')
/** Today's date in Nairobi as YYYY-MM-DD, for the date box's minimum. */
export const todayNairobi = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
