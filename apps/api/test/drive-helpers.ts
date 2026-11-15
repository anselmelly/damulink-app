import { auth, json } from './helpers'
import { call } from './request-helpers'
import { checkinDesk } from './checkin-helpers'
import type { TestApp } from './helpers'

export const dv = (facilityId: string, rest = '') => `/api/my-facilities/${facilityId}/drives${rest}`

/** A valid drive body; the test clock reads Sat 2026-11-14 11:00 Nairobi. */
export const driveBody = (over: Record<string, unknown> = {}) => ({
	host: 'Greenfield Secondary School',
	venue: 'School hall',
	town: 'Nakuru',
	date: '2026-11-21',
	starts: '09:00',
	ends: '15:00',
	publicText: 'Come and give blood at our school hall. Everyone is welcome.',
	target: 40,
	contactName: 'Mr Otieno',
	contactPhone: '0712345678',
	...over,
})

export async function driveDesk(t: TestApp) {
	const d = await checkinDesk(t)
	return { ...d, make: (over: Record<string, unknown> = {}, token = d.token) => call(t, 'POST', dv(d.id), token, driveBody(over)) }
}
export const made = async (t: TestApp, d: Awaited<ReturnType<typeof driveDesk>>, over: Record<string, unknown> = {}) => (await json(await d.make(over))) as { id: string; code: string; short: string; status: string }
export const publishDrive = (t: TestApp, d: { token: string; id: string }, driveId: string, body: Record<string, unknown> = { isPublic: true, smsEnabled: false }) => call(t, 'POST', dv(d.id, `/${driveId}/publish`), d.token, body)
export { auth }
