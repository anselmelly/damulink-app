import type { FacilityStatus } from '@damu/shared-types'

/** Badge class and label for each facility status, shared by the admin screens. */
export const STATUS: Record<FacilityStatus, [string, string]> = {
	incomplete: ['badge-neutral', 'Profile incomplete'],
	pending: ['badge-warn', 'Pending'],
	needs_info: ['badge-neutral', 'Needs info'],
	verified: ['badge-ok', 'Verified'],
	rejected: ['badge bg-red-100 text-red-800', 'Rejected'],
	suspended: ['badge-neutral', 'Suspended'],
}
export const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }) : '')
