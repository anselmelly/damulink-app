import { addMember } from '@damu/db'
import { auth, json, post, signup, verifiedFacility, verifyPhone, type TestApp } from './helpers'

/** A donor-side person with a verified phone, who may send requests. */
export async function requester(t: TestApp, over: Record<string, unknown> = {}) {
	const s = await signup(t, over)
	await verifyPhone(t, s.input.email)
	return s
}

/** A signed-up person added straight to the facility team. */
export async function member(t: TestApp, facilityId: string, role: 'admin' | 'attendant' = 'attendant', canApprove = false) {
	const s = await signup(t)
	await addMember(t.db, { facilityId, userId: s.body.user.id, role, canApprove, createdAt: t.clock.now() })
	return s
}

let n = 0
/** A valid request body; the test clock reads 2026-11-14T08:00Z. Every call gets its own patient unless one is given. */
export const requestBody = (facilityId: string, over: Record<string, unknown> = {}) => ({
	facilityId,
	patientRef: `Ward ${++n}, bed 12`,
	patientName: 'Test Patient',
	relation: 'family',
	bloodType: 'A+',
	units: 2,
	neededBy: '2026-11-16T08:00:00Z',
	urgency: 'normal',
	note: 'Surgery planned',
	genuine: true,
	...over,
})
export const sendRequest = (t: TestApp, token: string, facilityId: string, over: Record<string, unknown> = {}) => post(t, '/api/requests', requestBody(facilityId, over), auth(token))
export const sent = async (t: TestApp, token: string, facilityId: string, over: Record<string, unknown> = {}) => {
	const res = await sendRequest(t, token, facilityId, over)
	if (res.status !== 201) throw new Error(`request not sent: ${res.status} ${JSON.stringify(await res.clone().json())}`)
	return (await json(res)) as { id: string; number: string; status: string }
}

export const call = (t: TestApp, method: string, path: string, token: string, body?: unknown) =>
	t.app.request(path, { method, headers: { 'Content-Type': 'application/json', ...auth(token) }, body: body === undefined ? undefined : JSON.stringify(body) })
export const fq = (facilityId: string, rest = '') => `/api/my-facilities/${facilityId}/requests${rest}`

/** A verified facility with its admin, an attendant, an approver attendant and one requester. */
export async function desk(t: TestApp) {
	const f = await verifiedFacility(t)
	const attendant = await member(t, f.id)
	const approver = await member(t, f.id, 'attendant', true)
	const who = await requester(t)
	return { ...f, adminToken: f.owner.body.accessToken as string, attendant, approver, who }
}
export const confirmBody = { bloodType: 'A+', units: 2, urgency: 'normal' }
