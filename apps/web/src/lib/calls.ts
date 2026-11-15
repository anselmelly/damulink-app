import type { CallStatus } from '@damu/shared-types'

export const CALL_STATUS: Record<CallStatus, [string, string]> = {
	live: ['badge-ok', 'Live'],
	closed: ['badge-neutral', 'Closed'],
	expired: ['badge-neutral', 'Expired'],
	taken_down: ['badge-warn', 'Taken down'],
}
export const URGENCY_CARDS: [string, string, string][] = [
	['normal', 'Normal', 'New ring every 12 hours, respecting alert limits'],
	['urgent', 'Urgent', 'New ring every 2 hours, skips alert limits'],
	['surge', 'Surge', 'All rings at once, skips alert limits'],
]
export const urgencyLabel = (u: string) => (u === 'surge' ? 'Surge' : u === 'urgent' ? 'Urgent' : 'Normal')
export const CLOSE_CHOICES: [string, string][] = [
	['covered', 'All units covered'],
	['not_needed', 'No longer needed'],
	['cancelled', 'Cancelled by the requester'],
]
export const CLOSE_TEXT: Record<string, string> = { covered: 'All units covered', not_needed: 'No longer needed', cancelled: 'Cancelled by the requester', expired: 'Time ran out', facility_suspended: 'The facility was suspended' }
export const RESPONSE_STATUS: Record<string, [string, string]> = { willing: ['badge-soft', 'Willing'], scheduled: ['badge-ok', 'Scheduled'], donated: ['badge-ok', 'Donated'], not_needed: ['badge-neutral', 'Not needed'] }

/** "Saturday 7 November" in Nairobi time. */
export const closesOn = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Nairobi' })
/** The short link people share, on this site until a short domain exists. */
export const shortLink = (origin: string, short: string) => `${origin}/c/${short}`
