import { z } from 'zod'

/** What a donor can only make stricter, never looser (the super admin edits the real defaults later). */
export const ALERT_LIMIT_DEFAULTS = { weeklyCap: 3, quietFrom: 21, quietTo: 7 }

export const alertPrefsInput = z.object({
	smsAlerts: z.boolean(),
	emailAlerts: z.boolean(),
	available: z.boolean(),
	/** `keep` leaves an existing pause alone; `none` clears it. */
	pause: z.enum(['keep', 'none', '1w', '2w', '1m', '3m']).default('keep'),
	weeklyCap: z.number().int().min(1).max(14),
	quietFrom: z.number().int().min(0).max(23),
	quietTo: z.number().int().min(0).max(23),
})
export type AlertPrefsInput = z.infer<typeof alertPrefsInput>
export type AlertPrefs = Omit<AlertPrefsInput, 'pause'> & { pausedUntil: string | null; defaults: typeof ALERT_LIMIT_DEFAULTS }

export const reminderPrefsInput = z.object({
	cycle: z.enum(['on_day', 'days_before', 'custom', 'off']),
	daysBefore: z.number().int().refine((n) => [1, 3, 5, 7].includes(n), 'Choose 1, 3, 5 or 7 days'),
	cycleMonths: z.number().int().min(1).max(24).nullable().default(null),
	appointmentReminders: z.boolean(),
})
export type ReminderPrefs = z.infer<typeof reminderPrefsInput> & { minMonths: number }

export const profileInput = z
	.object({
		name: z.string().trim().min(2, 'Enter your name').max(100),
		email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
		sex: z.enum(['female', 'male']),
		dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
	})
	.partial()

export const facilitiesInput = z.object({
	homeFacilityId: z.string().length(26).nullable(),
	extraFacilityIds: z.array(z.string().length(26)).max(5).default([]),
})

export const facilityRequestInput = z.object({
	name: z.string().trim().min(2, 'Enter the facility name').max(150),
	town: z.string().trim().min(2, 'Enter the town').max(80),
	county: z.string().trim().max(80).optional(),
})

export const deleteAccountInput = z.object({ password: z.string().min(1).max(200) })
