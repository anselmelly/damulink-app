import { desk } from './request-helpers'
import { setDonorFacts, signup, verifyPhone, type TestApp } from './helpers'
import { call } from './request-helpers'

export const ck = (facilityId: string, code: string, rest = '') => `/api/my-facilities/${facilityId}/checkin/${encodeURIComponent(code)}${rest}`
export const lab = (facilityId: string, rest = '') => `/api/my-facilities/${facilityId}/lab-samples${rest}`
export const walkinUrl = (facilityId: string) => `/api/my-facilities/${facilityId}/walkins`

/** A facility desk (verified facility, attendant) and a way to make donors with a code. */
export async function checkinDesk(t: TestApp) {
	const d = await desk(t)
	return { ...d, token: d.attendant.body.accessToken as string }
}

/** A donor with a phone, a code and optional facts recorded by a facility (`verified` = blood type on file). */
export async function donor(t: TestApp, facts: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
	const s = await signup(t, { name: 'Faith Wambui', sex: 'female', dateOfBirth: '1995-05-10', ...over })
	await verifyPhone(t, s.input.email)
	if (Object.keys(facts).length) await setDonorFacts(t, s.input.email, facts)
	return { ...s, id: s.body.user.id as string, code: s.body.user.donorCode as string }
}
export const verifiedDonor = (t: TestApp, facts: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => donor(t, { blood_type: 'O-', ...facts }, over)

export const outcome = (t: TestApp, token: string, facilityId: string, code: string, body: unknown) => call(t, 'POST', ck(facilityId, code, '/outcome'), token, body)
export const lookup = (t: TestApp, token: string, facilityId: string, code: string) => call(t, 'GET', ck(facilityId, code), token)

/** A donor's appointment request at a facility, written straight into the table. */
let ap = 0
export async function appt(t: TestApp, userId: string, facilityId: string, over: Record<string, string | number | null> = {}) {
	const id = (over.id as string) ?? `AP${String(++ap).padStart(4, '0')}`.padEnd(26, 'X')
	const r = { kind: 'donate', days: 'mon,wed', time_of_day: 'any', status: 'requested', scheduled_at: null, reschedule_asked: 0, created_at: '2026-11-13 08:00:00', ...over }
	await t.pool.query(`insert into donation_requests (id, user_id, facility_id, kind, days, time_of_day, status, scheduled_at, reschedule_asked, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, userId, facilityId, r.kind, r.days, r.time_of_day, r.status, r.scheduled_at, r.reschedule_asked, r.created_at, r.created_at])
	return id
}
export const dr = (facilityId: string, rest = '') => `/api/my-facilities/${facilityId}/donor-requests${rest}`
