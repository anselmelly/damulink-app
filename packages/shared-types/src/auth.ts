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
	emailVerified: boolean
	phoneVerified: boolean
	canDonate: boolean
	donorCode: string | null
	isSuperAdmin: boolean
	facilities: { id: string; name: string }[]
}
