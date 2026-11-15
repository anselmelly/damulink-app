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
