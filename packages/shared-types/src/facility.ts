import { z } from 'zod'
import { DONOR_CODE_ALPHABET } from './donor-code'

export const FACILITY_TYPES = ['hospital', 'health centre', 'dispensary', 'clinic', 'blood bank'] as const
export const FACILITY_STATUSES = ['incomplete', 'pending', 'needs_info', 'verified', 'rejected', 'suspended'] as const
export type FacilityStatus = (typeof FACILITY_STATUSES)[number]

/** FC-XXXX-XX: what attendants type at login to open the facility side. Same letters as donor codes (no 0 O 1 I L). */
export function newFacilityCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
	const pick = (n: number) => Array.from(random(n), (b) => DONOR_CODE_ALPHABET[b % DONOR_CODE_ALPHABET.length]).join('')
	return `FC-${pick(4)}-${pick(2)}`
}
export const isFacilityCode = (s: string) => new RegExp(`^FC-[${DONOR_CODE_ALPHABET}]{4}-[${DONOR_CODE_ALPHABET}]{2}$`).test(s)

/** A telephone number of any kind (a switchboard is usually a landline). Stored with a leading + and digits only. */
const facilityPhone = z
	.string()
	.trim()
	.transform((v) => v.replace(/[\s()-]/g, ''))
	.refine((v) => /^\+?\d{7,15}$/.test(v), 'Enter a phone number we can call')
	.transform((v) => (v.startsWith('+') ? v : v.startsWith('0') ? `+254${v.slice(1)}` : `+${v}`))

export const facilityInput = z.object({
	name: z.string().trim().min(2, 'Enter the facility name').max(150),
	type: z.enum(FACILITY_TYPES, { message: 'Choose a type' }),
	licenseNumber: z.string().trim().min(3, 'Enter the license number').max(60),
	owner: z.string().trim().max(150).optional(),
	county: z.string().trim().min(2, 'Choose a county').max(80),
	town: z.string().trim().min(2, 'Enter the town').max(80),
	address: z.string().trim().max(200).optional(),
	lat: z.number({ message: 'Enter the latitude' }).min(-90).max(90),
	lng: z.number({ message: 'Enter the longitude' }).min(-180).max(180),
	phone: facilityPhone,
	email: z.string().trim().toLowerCase().email('Enter the facility email').max(254),
	role: z.string().trim().min(2, 'Enter your role at the facility').max(80),
	note: z.string().trim().max(500).optional(),
	authorised: z.literal(true, { message: 'You need to confirm this to continue' }),
})
export type FacilityInput = z.infer<typeof facilityInput>

export const facilityReplyInput = z.object({ text: z.string().trim().min(2, 'Write your answer').max(1000) })

export const decisionInput = z.object({
	action: z.enum(['approve', 'reject', 'ask', 'suspend', 'reactivate', 'note']),
	how: z.string().trim().max(80).optional(),
	/** The reason or question shown to the applicant (reject, ask) or the reviewer's note (note, suspend). */
	text: z.string().trim().max(1000).optional(),
})
export type DecisionInput = z.infer<typeof decisionInput>

export type FacilityEventView = { id: string; kind: string; text: string | null; how: string | null; visible: boolean; at: string; byName: string | null }

export type MyFacilityView = {
	id: string
	name: string
	type: string
	town: string
	county: string
	status: FacilityStatus
	role: 'admin' | 'attendant'
	facilityCode: string | null
	licenseNumber: string | null
	owner: string | null
	address: string | null
	lat: number | null
	lng: number | null
	phone: string | null
	email: string | null
	submittedAt: string | null
	/** Questions, replies and reasons the applicant may read, oldest first. */
	messages: FacilityEventView[]
}

export type AdminFacilityRow = {
	id: string
	name: string
	type: string
	town: string
	county: string
	status: FacilityStatus
	licenseNumber: string | null
	submittedAt: string | null
	duplicateLicense: boolean
}

export type AdminFacilityDetail = AdminFacilityRow & {
	owner: string | null
	address: string | null
	lat: number | null
	lng: number | null
	phone: string | null
	email: string | null
	facilityCode: string | null
	applicant: { id: string; name: string; roleTitle: string | null; email: string; emailVerified: boolean; phone: string; phoneVerified: boolean } | null
	events: FacilityEventView[]
	/** Other facilities that use the same license number. */
	duplicates: { id: string; name: string; town: string; status: FacilityStatus }[]
}
