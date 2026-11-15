import { z } from 'zod'
import { BRAND } from './brand'

export const driveRef = (n: number) => `DRIVE-${String(n).padStart(4, '0')}`
export const DRIVE_TABS = ['upcoming', 'today', 'past'] as const
export type DriveTab = (typeof DRIVE_TABS)[number]
export const DRIVE_DEFAULTS = { maxAheadDays: 180, maxOpen: 10, interestPerIpHour: 10 }

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM')
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null)

const fields = {
	host: z.string().trim().min(2, 'Enter the host').max(120),
	venue: z.string().trim().min(2, 'Enter the venue').max(160),
	town: z.string().trim().min(2, 'Enter the town').max(80),
	date: day,
	starts: hhmm,
	ends: hhmm,
	publicText: z.string().trim().min(1, 'Write the public text').max(200, 'Keep it under 200 characters'),
	target: z.number({ message: 'Enter a number' }).int('Whole donors only').min(1, 'At least 1').max(5000).nullish().transform((v) => v ?? null),
	contactName: optionalText(100),
	contactPhone: optionalText(30),
}
export const driveInput = z.object(fields).superRefine((v, ctx) => {
	if (v.ends <= v.starts) ctx.addIssue({ code: 'custom', path: ['ends'], message: 'The drive must end after it starts' })
})
export const driveUpdateInput = z.object(fields).partial().superRefine((v, ctx) => {
	if (Object.keys(v).length === 0) ctx.addIssue({ code: 'custom', path: ['host'], message: 'Change at least one thing' })
	if (v.starts && v.ends && v.ends <= v.starts) ctx.addIssue({ code: 'custom', path: ['ends'], message: 'The drive must end after it starts' })
})
export const drivePublishInput = z.object({ isPublic: z.boolean(), smsEnabled: z.boolean() })

export type DriveItem = {
	id: string
	code: string
	short: string
	host: string
	venue: string
	town: string
	date: string
	starts: string
	ends: string
	status: 'draft' | 'published' | 'closed' | 'cancelled' | 'taken_down'
	/** draft, published (before its day), open (today), ended, closed, cancelled, taken_down */
	phase: string
	isPublic: boolean
	smsEnabled: boolean
	interested: number
	target: number | null
}
export type DriveList = { counts: Record<DriveTab, number>; items: DriveItem[] }
export type DriveDetail = DriveItem & { publicText: string; contactName: string | null; contactPhone: string | null; publishedAt: string | null; canEdit: boolean }
export type DrivePublishInfo = { audience: { total: number; ring1: number; ring2: number; ring3: number }; sms: { text: string; length: number }; link: string }

const at = (date: string) => new Date(`${date}T00:00:00Z`)
const wd = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(at(date))
const mon = (date: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(at(date))
const hm = (t: string) => t.replace(/^0/, '')
/** "Sat 14 Nov" */
export const driveDay = (date: string) => `${wd(date)} ${Number(date.slice(8, 10))} ${mon(date)}`
/** "9:00 to 15:00" */
export const driveHours = (starts: string, ends: string) => `${hm(starts)} to ${hm(ends)}`

type When = { host: string; town: string; date: string; starts: string; ends: string; link: string }
/** One text per donor per drive: no personal details, no host contact, no YES (it is not a call). */
export const driveSms = (o: When) => `${BRAND.name}: Blood drive at ${o.host}, ${o.town}, ${driveDay(o.date)} ${hm(o.starts)}-${hm(o.ends)}. Details: ${o.link}. Reply STOP to stop alerts.`

/** A guest says who they are; a signed-in donor sends nothing (the name comes from the account). */
export const driveInterestInput = z.object({
	name: z.string({ message: 'Enter your name' }).trim().min(2, 'Enter your name').max(100),
	phone: z.string().trim().max(30).nullish().transform((v) => v || null),
})
export type PublicDrive = {
	code: string
	short: string
	host: string
	venue: string
	town: string
	date: string
	starts: string
	ends: string
	text: string
	facility: { name: string; town: string }
	link: string
	state: 'open' | 'ended' | 'cancelled'
	/** true only for a signed-in donor who is on the list */
	interested: boolean
}
export type PublicDriveList = { items: PublicDrive[] }
