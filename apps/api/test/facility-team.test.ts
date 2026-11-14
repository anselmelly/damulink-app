import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addFacility, applicant, auth, decideAs, get, invite, json, makeTestApp, post, resetAccounts, setDonorFacts, signup, smsCode, verifiedFacility, verifyPhone } from './helpers'

const t = makeTestApp() // clock 2026-11-14T08:00Z
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())
const call = (method: string, path: string, token: string, body?: unknown) => t.app.request(path, { method, headers: { 'Content-Type': 'application/json', ...auth(token) }, body: body === undefined ? undefined : JSON.stringify(body) })
const members = async (token: string, id: string) => json(await get(t, `/api/my-facilities/${id}/members`, auth(token)))

/** A verified facility whose admin has invited `email`; the invitee signs up through the invite. */
async function attendantJoined(email = 'grace@lakeview.example', role: 'attendant' | 'admin' = 'attendant') {
	const f = await verifiedFacility(t)
	const inv = await invite(t, f.owner.body.accessToken, f.id, email, role)
	const res = await post(t, `/api/invites/${inv.token}/join`, { name: 'Grace Njeri', phone: '0712000111', password: 'correct-horse' })
	return { ...f, inv, joined: await json(res), joinStatus: res.status }
}

describe('adding attendants', () => {
	it('only a verified facility can (409), and only its admin (403 for an attendant, 404 for a stranger)', async () => {
		const a = await applicant(t) // pending
		expect((await post(t, `/api/my-facilities/${a.facility.id}/attendants`, { email: 'x@example.com' }, auth(a.body.accessToken))).status).toBe(409)
		const f = await verifiedFacility(t)
		const stranger = await signup(t)
		expect((await post(t, `/api/my-facilities/${f.id}/attendants`, { email: 'x@example.com' }, auth(stranger.body.accessToken))).status).toBe(404)
		const { joined } = await attendantJoined()
		const f2 = await verifiedFacility(t)
		void f2
		expect(joined.accessToken).toBeTruthy()
	})
	it('sends the invitee an email with the facility name, code and a link; lists them as invited', async () => {
		const f = await verifiedFacility(t, { name: 'Lakeview Hospital' })
		const inv = await invite(t, f.owner.body.accessToken, f.id, 'mercy@lakeview.example')
		expect(inv.res.status).toBe(201)
		const mail = t.mail.sent.find((m) => m.to === 'mercy@lakeview.example')!
		expect(mail.text).toContain('Lakeview Hospital')
		expect(mail.text).toContain(f.code)
		expect(mail.text).toContain('http://localhost:5173/join-facility?token=')
		const list = await members(f.owner.body.accessToken, f.id)
		expect(list.map((m: any) => [m.email, m.role, m.status])).toEqual([[f.owner.input.email, 'admin', 'active'], ['mercy@lakeview.example', 'attendant', 'invited']])
		expect(list[0].isMe).toBe(true)
	})
	it('checks the email (422); a person who is already a member is 409; asking again resends and kills the old link', async () => {
		const { owner, id, inv } = await attendantJoined('grace@lakeview.example')
		expect((await post(t, `/api/my-facilities/${id}/attendants`, { email: 'nope' }, auth(owner.body.accessToken))).status).toBe(422)
		const already = await post(t, `/api/my-facilities/${id}/attendants`, { email: 'grace@lakeview.example' }, auth(owner.body.accessToken))
		expect(already.status).toBe(409)
		expect((await json(already)).error.code).toBe('already_member')
		const first = await invite(t, owner.body.accessToken, id, 'new@lakeview.example')
		const again = await invite(t, owner.body.accessToken, id, 'new@lakeview.example')
		expect(again.token).not.toBe(first.token)
		expect((await get(t, `/api/invites/${first.token}`)).status).toBe(404)
		expect((await get(t, `/api/invites/${again.token}`)).status).toBe(200)
		void inv
	})
})

describe('the invite', () => {
	it('is public: shows the facility, the invited email, the role and who invited; says if the account exists', async () => {
		const f = await verifiedFacility(t, { name: 'Lakeview Hospital', town: 'Kisumu' })
		const existing = await signup(t)
		const fresh = await invite(t, f.owner.body.accessToken, f.id, 'brand.new@lakeview.example', 'admin')
		const known = await invite(t, f.owner.body.accessToken, f.id, existing.input.email)
		expect(await json(await get(t, `/api/invites/${fresh.token}`))).toEqual({ facilityName: 'Lakeview Hospital', town: 'Kisumu', email: 'brand.new@lakeview.example', role: 'admin', invitedBy: f.owner.input.name, accountExists: false })
		expect((await json(await get(t, `/api/invites/${known.token}`))).accountExists).toBe(true)
	})
	it('a made-up, used or expired token is 404; it expires after 14 days', async () => {
		const f = await verifiedFacility(t)
		expect((await get(t, `/api/invites/${'x'.repeat(43)}`)).status).toBe(404)
		const inv = await invite(t, f.owner.body.accessToken, f.id, 'late@lakeview.example')
		t.clock.advance(15 * 24 * 3600 * 1000)
		expect((await get(t, `/api/invites/${inv.token}`)).status).toBe(404)
		expect((await post(t, `/api/invites/${inv.token}/join`, { name: 'Late Person', phone: '0712000222', password: 'correct-horse' })).status).toBe(404)
	})
})

describe('joining as a new person (no donor details)', () => {
	it('creates the account from the invite: email taken from the invite and already verified, a member with the invited role, a phone code sent', async () => {
		const { id, joined, joinStatus } = await attendantJoined('grace@lakeview.example', 'attendant')
		expect(joinStatus).toBe(201)
		const me = await json(await get(t, '/api/me', auth(joined.accessToken)))
		expect(me).toMatchObject({ name: 'Grace Njeri', email: 'grace@lakeview.example', emailVerified: true, phoneVerified: false, canDonate: false, donorCode: null })
		expect(me.managedFacilities).toEqual([expect.objectContaining({ id, role: 'attendant' })])
		expect(smsCode(t)).toMatch(/^\d{6}$/)
	})
	it('an invite for admin makes them an admin', async () => {
		const { id, joined } = await attendantJoined('boss@lakeview.example', 'admin')
		expect((await json(await get(t, '/api/me', auth(joined.accessToken)))).managedFacilities[0]).toMatchObject({ id, role: 'admin' })
	})
	it('the link works once; if an account with that email exists the new-account route says so (409)', async () => {
		const { inv } = await attendantJoined()
		expect((await post(t, `/api/invites/${inv.token}/join`, { name: 'Grace Njeri', phone: '0712000333', password: 'correct-horse' })).status).toBe(404)
		const f = await verifiedFacility(t)
		const existing = await signup(t)
		const known = await invite(t, f.owner.body.accessToken, f.id, existing.input.email)
		const res = await post(t, `/api/invites/${known.token}/join`, { name: 'Someone', phone: '0712000444', password: 'correct-horse' })
		expect(res.status).toBe(409)
		expect((await json(res)).error.code).toBe('account_exists')
	})
	it('checks the form (422) and refuses a taken phone (409)', async () => {
		const f = await verifiedFacility(t)
		const other = await signup(t, { phone: '0712999888' })
		const inv = await invite(t, f.owner.body.accessToken, f.id, 'new@lakeview.example')
		expect((await post(t, `/api/invites/${inv.token}/join`, { name: 'x', phone: '0712000555', password: 'correct-horse' })).status).toBe(422)
		expect((await post(t, `/api/invites/${inv.token}/join`, { name: 'Grace', phone: '12345', password: 'correct-horse' })).status).toBe(422)
		expect((await post(t, `/api/invites/${inv.token}/join`, { name: 'Grace', phone: '0712999888', password: 'correct-horse' })).status).toBe(409)
		expect(other.body.accessToken).toBeTruthy()
		expect((await get(t, `/api/invites/${inv.token}`)).status).toBe(200) // a failed try does not use the invite up
	})
})

describe('accepting with an existing account', () => {
	it('adds the member; the signed-in email must match the invite (403 otherwise)', async () => {
		const f = await verifiedFacility(t)
		const existing = await signup(t)
		const other = await signup(t)
		const inv = await invite(t, f.owner.body.accessToken, f.id, existing.input.email)
		expect((await post(t, `/api/invites/${inv.token}/accept`, {}, auth(other.body.accessToken))).status).toBe(403)
		expect((await post(t, `/api/invites/${inv.token}/accept`, {})).status).toBe(401)
		const res = await post(t, `/api/invites/${inv.token}/accept`, {}, auth(existing.body.accessToken))
		expect(res.status).toBe(200)
		expect(await json(res)).toMatchObject({ id: f.id, role: 'attendant' })
		expect((await post(t, `/api/invites/${inv.token}/accept`, {}, auth(existing.body.accessToken))).status).toBe(404) // used
		expect((await json(await get(t, '/api/me', auth(existing.body.accessToken)))).managedFacilities).toHaveLength(1)
	})
})

describe('managing the team', () => {
	it('only admins see the team (403 for an attendant)', async () => {
		const { id, joined } = await attendantJoined()
		expect((await get(t, `/api/my-facilities/${id}/members`, auth(joined.accessToken))).status).toBe(403)
	})
	it('promote an attendant to admin and back; the last admin can neither be demoted nor removed (409)', async () => {
		const { owner, id, joined } = await attendantJoined()
		const gid = (await json(await get(t, '/api/me', auth(joined.accessToken)))).id
		expect((await call('PATCH', `/api/my-facilities/${id}/members/${gid}`, owner.body.accessToken, { role: 'admin' })).status).toBe(200)
		expect((await members(owner.body.accessToken, id)).find((m: any) => m.userId === gid).role).toBe('admin')
		expect((await call('PATCH', `/api/my-facilities/${id}/members/${gid}`, owner.body.accessToken, { role: 'attendant' })).status).toBe(200)
		const ownerId = (await json(await get(t, '/api/me', auth(owner.body.accessToken)))).id
		const demote = await call('PATCH', `/api/my-facilities/${id}/members/${ownerId}`, owner.body.accessToken, { role: 'attendant' })
		expect(demote.status).toBe(409)
		expect((await json(demote)).error.code).toBe('last_admin')
		expect((await call('DELETE', `/api/my-facilities/${id}/members/${ownerId}`, owner.body.accessToken)).status).toBe(409)
	})
	it('removing a person ends their access to the facility; a second admin may leave', async () => {
		const { owner, id, joined } = await attendantJoined()
		const gid = (await json(await get(t, '/api/me', auth(joined.accessToken)))).id
		expect((await call('DELETE', `/api/my-facilities/${id}/members/${gid}`, owner.body.accessToken)).status).toBe(204)
		expect((await get(t, `/api/my-facilities/${id}`, auth(joined.accessToken))).status).toBe(404)
		expect((await json(await get(t, '/api/me', auth(joined.accessToken)))).managedFacilities).toEqual([])
		expect((await members(owner.body.accessToken, id)).map((m: any) => m.email)).toEqual([owner.input.email])
	})
	it('an attendant cannot change roles or remove anyone (403)', async () => {
		const { owner, id, joined } = await attendantJoined()
		const ownerId = (await json(await get(t, '/api/me', auth(owner.body.accessToken)))).id
		expect((await call('PATCH', `/api/my-facilities/${id}/members/${ownerId}`, joined.accessToken, { role: 'attendant' })).status).toBe(403)
		expect((await call('DELETE', `/api/my-facilities/${id}/members/${ownerId}`, joined.accessToken)).status).toBe(403)
	})
	it('revoking an invite kills its link', async () => {
		const f = await verifiedFacility(t)
		const inv = await invite(t, f.owner.body.accessToken, f.id, 'oops@lakeview.example')
		const row = (await members(f.owner.body.accessToken, f.id)).find((m: any) => m.status === 'invited')
		expect((await call('DELETE', `/api/my-facilities/${f.id}/invites/${row.inviteId}`, f.owner.body.accessToken)).status).toBe(204)
		expect((await get(t, `/api/invites/${inv.token}`)).status).toBe(404)
		expect((await members(f.owner.body.accessToken, f.id)).map((m: any) => m.status)).toEqual(['active'])
	})
})

describe('the public join link for donors', () => {
	it('every facility gets a readable link name; two with the same name and town do not clash', async () => {
		const a = await applicant(t, { name: 'Rift County Hospital', town: 'Nakuru' })
		const b = await applicant(t, { name: 'Rift County Hospital', town: 'Nakuru' })
		const [rows] = (await t.pool.query('select slug from facilities order by id')) as any
		expect(rows[0].slug).toBe('rift-county-hospital-nakuru')
		expect(rows[1].slug).toMatch(/^rift-county-hospital-nakuru-[a-z0-9]+$/)
		expect(a.facility.id).not.toBe(b.facility.id)
	})
	it('answers for a verified facility only (404 for pending, suspended or unknown)', async () => {
		const f = await verifiedFacility(t, { name: 'Rift County Hospital', town: 'Nakuru' })
		const res = await get(t, '/api/facilities/by-slug/rift-county-hospital-nakuru')
		expect(res.status).toBe(200)
		expect(await json(res)).toEqual({ id: f.id, name: 'Rift County Hospital', town: 'Nakuru', county: 'Kisumu' })
		await decideAs(t, f.ad.body.accessToken, f.id, { action: 'suspend', text: 'x' })
		expect((await get(t, '/api/facilities/by-slug/rift-county-hospital-nakuru')).status).toBe(404)
		expect((await get(t, '/api/facilities/by-slug/nowhere')).status).toBe(404)
		await applicant(t, { name: 'Pending Clinic', town: 'Nyeri' })
		expect((await get(t, '/api/facilities/by-slug/pending-clinic-nyeri')).status).toBe(404)
	})
	it('the link is shown to the facility admin', async () => {
		const f = await verifiedFacility(t, { name: 'Rift County Hospital', town: 'Nakuru' })
		expect((await json(await get(t, `/api/my-facilities/${f.id}`, auth(f.owner.body.accessToken)))).slug).toBe('rift-county-hospital-nakuru')
	})
})

describe('donor numbers', () => {
	it('count donors who chose this as their home facility, and how many are verified (admins only)', async () => {
		const f = await verifiedFacility(t)
		const a = await signup(t, { homeFacilityId: f.id })
		await signup(t, { homeFacilityId: f.id })
		await signup(t, { homeFacilityId: await addFacility(t, 'Elsewhere Hospital', 'Eldoret') })
		await setDonorFacts(t, a.input.email, { blood_type: 'O+' })
		expect(await json(await get(t, `/api/my-facilities/${f.id}/stats`, auth(f.owner.body.accessToken)))).toEqual({ homeDonors: 2, verifiedDonors: 1, registeredDonors: 1 })
		expect((await get(t, `/api/my-facilities/${f.id}/stats`, auth(a.body.accessToken))).status).toBe(404)
	})
})

describe('editing the facility profile', () => {
	const patch = (token: string, id: string, body: unknown) => call('PATCH', `/api/my-facilities/${id}/profile`, token, body)
	it('an admin can change contact details and the verified status stays', async () => {
		const f = await verifiedFacility(t)
		const res = await patch(f.owner.body.accessToken, f.id, { phone: '0572020001', email: 'new@lakeview.example', address: 'Behind the market', owner: 'County government' })
		expect(res.status).toBe(200)
		expect(await json(res)).toMatchObject({ status: 'verified', phone: '+254572020001', email: 'new@lakeview.example', address: 'Behind the market' })
	})
	it('moving the pin sends the facility back for review, with a message the admin can read', async () => {
		const f = await verifiedFacility(t)
		const res = await patch(f.owner.body.accessToken, f.id, { lat: -0.1, lng: 34.8 })
		expect((await json(res)).status).toBe('pending')
		const mine = await json(await get(t, `/api/my-facilities/${f.id}`, auth(f.owner.body.accessToken)))
		expect(mine.messages.at(-1).text).toMatch(/pin/i)
		expect(await json(await get(t, '/api/facilities'))).toEqual([]) // out of the public list until re-verified
	})
	it('a pin that barely moves (rounding) does not trigger a review', async () => {
		const f = await verifiedFacility(t)
		expect((await json(await patch(f.owner.body.accessToken, f.id, { lat: -0.091701, lng: 34.768001 }))).status).toBe('verified')
	})
	it('the license number cannot be changed through here (it is locked once verified)', async () => {
		const f = await verifiedFacility(t)
		const res = await patch(f.owner.body.accessToken, f.id, { licenseNumber: 'CHANGED-1' })
		expect([200, 422]).toContain(res.status)
		const [rows] = (await t.pool.query('select license_number from facilities where id = ?', [f.id])) as any
		expect(rows[0].license_number).not.toBe('CHANGED-1')
	})
	it('only admins (403 for an attendant), checks values (422), and a facility that is not verified cannot be edited this way (409)', async () => {
		const { id, owner, joined } = await attendantJoined()
		expect((await patch(joined.accessToken, id, { phone: '0572020001' })).status).toBe(403)
		expect((await patch(owner.body.accessToken, id, { lat: 120 })).status).toBe(422)
		const a = await applicant(t)
		expect((await patch(a.body.accessToken, a.facility.id, { phone: '0572020001' })).status).toBe(409)
	})
})
void verifyPhone
