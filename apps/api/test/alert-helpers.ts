import { normalizePhone } from '@damu/shared-types'
import { savePrefs } from '@damu/db'
import { setDonorFacts, signup, verifiedFacility, verifyPhone, type TestApp } from './helpers'
import { approved, publish } from './call-helpers'

/** A verified, eligible, opted-in donor with a home facility. Pass `facts` (column: value) to break one rule. */
export async function donor(t: TestApp, facilityId: string | undefined, over: { signup?: Record<string, unknown>; facts?: Record<string, unknown>; extra?: string[]; phone?: boolean } = {}) {
	const s = await signup(t, { homeFacilityId: facilityId, extraFacilityIds: over.extra ?? [], ...over.signup })
	if (s.res.status !== 201) throw new Error(`donor signup failed ${s.res.status}`)
	await setDonorFacts(t, s.input.email, { blood_type: 'A+', weight_kg: 62, ...over.facts })
	if (over.phone !== false) await verifyPhone(t, s.input.email)
	return { ...s, e164: normalizePhone(s.input.phone)!, id: s.body.user.id as string }
}
export const prefs = (t: TestApp, userId: string, over: Record<string, unknown> = {}) =>
	savePrefs(t.db, { userId, smsAlerts: true, emailAlerts: false, available: true, updatedAt: t.clock.now(), ...over } as any)

/** A facility at an offset from the base one (Kisumu, -0.0917 34.768). 0.045 degrees is about 5 km. */
export const near = (t: TestApp, dLat: number, county = 'Kisumu') => verifiedFacility(t, { lat: -0.0917 + dLat, lng: 34.768, county, town: county })

/** An approved A+ request at its own facility, published with SMS on. */
export async function smsCall(t: TestApp, publishOver: Record<string, unknown> = {}, reqOver: Record<string, unknown> = {}) {
	const a = await approved(t, reqOver)
	return { a, publishWith: () => publish(t, a.attendant.body.accessToken, a.id, a.r.id, { smsEnabled: true, ...publishOver }) }
}

/** The alert texts the fake SMS sent (OTP and other texts left out). */
export const alerts = (t: TestApp) => t.sms.sent.filter((m) => /blood needed at/.test(m.text))
export const toPhones = (t: TestApp) => alerts(t).map((m) => m.to)
export const tick = (t: TestApp, key = 'test-cron-key') => t.app.request(`/api/cron/tick?key=${key}`, { method: 'POST' })
export const inbound = (t: TestApp, from: string, text: string, key: string | null = 'test-hook-key') =>
	t.app.request(`/api/sms/inbound${key === null ? '' : `?key=${key}`}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ from, text }).toString() })
export const hoursLater = (t: TestApp, h: number) => (t.clock as any).advance(h * 3600_000)
