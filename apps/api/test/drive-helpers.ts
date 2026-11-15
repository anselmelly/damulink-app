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

export const say = (t: TestApp, code: string, body?: unknown, headers: Record<string, string> = {}) =>
	t.app.request(`/api/public/drives/${code}/interest`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })

/** A published drive running today (Sat 2026-11-14, 11:05 to 15:00 Nairobi). The clock ends up at 11:06, so the drive has started. */
export async function dayDrive(t: TestApp, d: Awaited<ReturnType<typeof driveDesk>>, over: Record<string, unknown> = {}, publish: Record<string, unknown> = { isPublic: true, smsEnabled: false }) {
	const m = await made(t, d, { date: '2026-11-14', starts: '11:05', ends: '15:00', ...over })
	await publishDrive(t, d, m.id, publish)
	t.clock.set('2026-11-14T08:06:00Z')
	return m
}
export const dday = (t: TestApp, d: { token: string; id: string }, driveId: string, token = d.token) => call(t, 'GET', dv(d.id, `/${driveId}/day`), token)
export const darrived = (t: TestApp, d: { token: string; id: string }, driveId: string, iid: string, arrived: unknown = true, token = d.token) => call(t, 'POST', dv(d.id, `/${driveId}/interest/${iid}/arrived`), token, { arrived })
export const dclose = (t: TestApp, d: { token: string; id: string }, driveId: string, token = d.token) => call(t, 'POST', dv(d.id, `/${driveId}/close`), token)
export const dsummary = (t: TestApp, d: { token: string; id: string }, driveId: string, token = d.token) => call(t, 'GET', dv(d.id, `/${driveId}/summary`), token)
export const ddownload = (t: TestApp, d: { token: string; id: string }, driveId: string, token = d.token) => call(t, 'GET', dv(d.id, `/${driveId}/summary/download`), token)
