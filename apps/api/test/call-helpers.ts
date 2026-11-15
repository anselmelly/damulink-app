import { callResponses } from '@damu/db'
import { auth, get, json, login, signup, type TestApp } from './helpers'
import { call, confirmBody, desk, fq, requestBody, sent } from './request-helpers'
import { newId } from '../src/lib/id'

export const cq = (facilityId: string, rest = '') => `/api/my-facilities/${facilityId}/calls${rest}`

/** A desk plus one A+ request, sent by the requester, confirmed and approved. */
export async function approved(t: TestApp, over: Record<string, unknown> = {}) {
	const d = await desk(t)
	const r = await sent(t, d.who.body.accessToken, d.id, { bloodType: 'A+', units: 2, ...over })
	await call(t, 'POST', fq(d.id, `/${r.id}/confirm`), d.attendant.body.accessToken, { ...confirmBody, bloodType: (over.bloodType as string) ?? 'A+', units: (over.units as number) ?? 2 })
	await call(t, 'POST', fq(d.id, `/${r.id}/approve`), d.approver.body.accessToken)
	return { ...d, r }
}

export const publishBody = (over: Record<string, unknown> = {}) => ({
	types: ['A+', 'A-', 'O+', 'O-'],
	urgency: 'normal',
	publicText: 'We are appealing for A+ blood. Please share this call.',
	isPublic: true,
	smsEnabled: false,
	...over,
})
export const publish = (t: TestApp, token: string, facilityId: string, rid: string, over: Record<string, unknown> = {}) => call(t, 'POST', fq(facilityId, `/${rid}/publish`), token, publishBody(over))

/** Approved request plus a live public call. */
export async function live(t: TestApp, over: Record<string, unknown> = {}, publishOver: Record<string, unknown> = {}) {
	const a = await approved(t, over)
	const res = await publish(t, a.attendant.body.accessToken, a.id, a.r.id, publishOver)
	if (res.status !== 201) throw new Error(`publish failed: ${res.status} ${JSON.stringify(await res.clone().json())}`)
	return { ...a, c: (await json(res)) as { id: string; number: string; short: string; status: string; closesAt: string } }
}

/** A donor says YES to the call (the SMS and web ways in arrive later; here the row is written directly). */
export async function respond(t: TestApp, callId: string, over: Record<string, unknown> = {}) {
	const s = await signup(t, { name: 'Brian Otieno' })
	const id = newId(t.clock.now().getTime())
	await t.db.insert(callResponses).values({ id, callId, userId: s.body.user.id, ring: 1, status: 'willing', repliedAt: t.clock.now(), ...over } as any)
	return { id, donor: s }
}

export const detail = async (t: TestApp, token: string, facilityId: string, cid: string) => json(await get(t, cq(facilityId, `/${cid}`), auth(token)))
export { call, fq, requestBody }

/** A fresh access token for a signed-up person (use after moving the clock far ahead). */
export async function fresh(t: TestApp, s: { input: { email: string; password: string } }) {
	return (await json(await login(t, s.input.email, s.input.password))).accessToken as string
}
