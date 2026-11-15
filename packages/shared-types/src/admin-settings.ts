import { z } from 'zod'
import { ALERT_LIMIT_DEFAULTS } from './settings'
import { DEFAULT_ELIGIBILITY } from './eligibility'
import { RING_DEFAULTS } from './alerts'
import { REQUEST_DEFAULTS } from './request'
import { DRIVE_DEFAULTS } from './drives'

/**
 * The only settings the super admin can edit. A key that is not here can never be written, so a typo or a future secret is safe.
 * `store` is where the value lives: a whole row (`key`), or one field inside an object row (`key.field`, e.g. eligibility.minAge).
 */
export type SettingField = { key: string; label: string; unit: string; min: number; max: number; def: number }
export type SettingGroup = { id: string; title: string; note: string; draft: boolean; fields: SettingField[] }
const f = (key: string, label: string, unit: string, min: number, max: number, def: number): SettingField => ({ key, label, unit, min, max, def })

export const SETTING_GROUPS: SettingGroup[] = [
	{
		id: 'eligibility', title: 'Eligibility', draft: true, note: 'Used for "Likely eligible" everywhere. Facility screening always has the final say.',
		fields: [
			f('eligibility.minAge', 'Minimum age', 'years', 16, 30, DEFAULT_ELIGIBILITY.minAge),
			f('eligibility.maxAge', 'Maximum age', 'years', 50, 80, DEFAULT_ELIGIBILITY.maxAge),
			f('eligibility.minWeightKg', 'Minimum weight', 'kg', 40, 80, DEFAULT_ELIGIBILITY.minWeightKg),
			f('eligibility.waitingMonthsMale', 'Waiting period, men', 'months', 1, 12, DEFAULT_ELIGIBILITY.waitingMonthsMale),
			f('eligibility.waitingMonthsFemale', 'Waiting period, women', 'months', 1, 12, DEFAULT_ELIGIBILITY.waitingMonthsFemale),
		],
	},
	{
		id: 'alerts', title: 'Alert limits', draft: true, note: 'Donors can set stricter limits for themselves, never looser. Urgent and surge calls skip the weekly cap.',
		fields: [
			f('alert_limits.weeklyCap', 'Weekly alert cap', 'alerts', 1, 14, ALERT_LIMIT_DEFAULTS.weeklyCap),
			f('alert_limits.quietFrom', 'Quiet hours start', "o'clock", 0, 23, ALERT_LIMIT_DEFAULTS.quietFrom),
			f('alert_limits.quietTo', 'Quiet hours end', "o'clock", 0, 23, ALERT_LIMIT_DEFAULTS.quietTo),
		],
	},
	{
		id: 'rings', title: 'Rings and speed', draft: true, note: "Ring 1 is the facility's own donors. Later rings widen by distance. Surge sends to all rings at once.",
		fields: [
			f('rings.ring2_km', 'Ring 2 distance', 'km', 1, 100, RING_DEFAULTS.ring2Km),
			f('rings.ring3_km', 'Ring 3 distance', 'km', 2, 300, RING_DEFAULTS.ring3Km),
			f('rings.normal_hours', 'Normal: new ring every', 'hours', 1, 72, RING_DEFAULTS.normalHours),
			f('rings.urgent_hours', 'Urgent: new ring every', 'hours', 1, 24, RING_DEFAULTS.urgentHours),
		],
	},
	{
		id: 'requests', title: 'Request limits', draft: false, note: 'How many requests a person can send, and how far ahead.',
		fields: [
			f('requests.daily_cap', 'Requests per user per day', 'requests', 1, 20, REQUEST_DEFAULTS.dailyCap),
			f('requests.max_days_ahead', 'Needed-by at most', 'days ahead', 1, 90, REQUEST_DEFAULTS.maxDaysAhead),
		],
	},
	{
		id: 'drives', title: 'Blood drives', draft: false, note: 'Limits for drives, and how long the interested list is kept.',
		fields: [
			f('drives.max_ahead_days', 'Drive date at most', 'days ahead', 7, 365, DRIVE_DEFAULTS.maxAheadDays),
			f('drives.max_open', 'Open drives per facility', 'drives', 1, 50, DRIVE_DEFAULTS.maxOpen),
			f('drives.interest_per_ip_hour', 'Interest posts per address per hour', 'posts', 1, 100, DRIVE_DEFAULTS.interestPerIpHour),
			f('retention.drive_rsvp_days', 'Delete drive interest after', 'days', 1, 30, 1),
		],
	},
]
export const SETTING_FIELDS = SETTING_GROUPS.flatMap((g) => g.fields)
export const settingsChangeInput = z.object({ changes: z.record(z.string(), z.unknown()) })

export type AdminSettings = { groups: (Omit<SettingGroup, 'fields'> & { fields: (SettingField & { value: number })[] })[]; compatibility: Record<string, string[]> }
export type AdminUserRow = { id: string; name: string; email: string; you: boolean; addedAt: string | null }
export const addAdminInput = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email').max(254) })
