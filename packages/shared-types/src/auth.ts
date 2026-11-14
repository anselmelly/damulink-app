import { z } from 'zod'
import { normalizePhone } from './phone'

export const phoneField = z.string().transform((v, ctx) => {
	const p = normalizePhone(v)
	if (!p) ctx.addIssue({ code: 'custom', message: 'Enter a valid Kenyan phone number' })
	return p ?? ''
})

export const passwordField = z.string().min(8, 'Use at least 8 characters').max(200)

export const signupInput = z.object({
	name: z.string().trim().min(2, 'Enter your name').max(100),
	email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
	phone: phoneField,
	password: passwordField,
	sex: z.enum(['female', 'male']),
	dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
	homeFacilityId: z.string().length(26).optional(),
	unlistedFacilityName: z.string().trim().min(2).max(150).optional(),
	extraFacilityIds: z.array(z.string().length(26)).max(5).default([]),
	smsOptIn: z.boolean().default(false),
})
export type SignupInput = z.infer<typeof signupInput>

export const loginInput = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) })
export const refreshInput = z.object({ refreshToken: z.string().min(20).max(200) })

export type MeResponse = {
	id: string
	name: string
	email: string
	phone: string // masked
	sex: 'female' | 'male'
	dateOfBirth: string // YYYY-MM-DD, the donor's own
	emailVerified: boolean
	phoneVerified: boolean
	canDonate: boolean
	donorCode: string | null
	isSuperAdmin: boolean
	facilities: { id: string; name: string }[]
	/** Facilities this person runs (admin) or works at (attendant), whatever their status. */
	managedFacilities: { id: string; name: string; status: string; role: 'admin' | 'attendant' }[]
	/** Registered until a facility records a blood type, then Verified. */
	donorStatus: 'registered' | 'verified'
	bloodType: string | null
	/** "Likely eligible": the facility's screening on the day has the final say. */
	eligibility: import('./eligibility').Eligibility
}

export const verifyEmailInput = z.object({ token: z.string().min(20).max(100) })
export const phoneVerifyInput = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') })
export const phoneSendInput = z.object({ phone: phoneField.optional() })
export const forgotInput = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') })
export const resetInput = z.object({ token: z.string().min(20).max(100), password: passwordField })
export const changePasswordInput = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordField })

export const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const
export type BloodType = (typeof BLOOD_TYPES)[number]
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export const donationRequestInput = z.object({
	kind: z.enum(['test', 'donate']),
	facilityId: z.string().length(26, 'Choose a facility'),
	days: z.array(z.enum(WEEKDAYS)).min(1, 'Choose at least one day').max(7),
	timeOfDay: z.enum(['morning', 'afternoon', 'any']),
})
export type DonationRequestInput = z.infer<typeof donationRequestInput>

export type DonationRequestView = {
	id: string
	kind: 'test' | 'donate'
	facilityId: string
	facilityName: string
	days: string[]
	timeOfDay: 'morning' | 'afternoon' | 'any'
	status: 'requested' | 'scheduled' | 'completed' | 'cancelled' | 'no_show'
	scheduledAt: string | null
	createdAt: string
}
