import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, applicant, auth, get, json, makeTestApp, post, resetAccounts, signup } from './helpers'

const t = makeTestApp() // clock 2026-11-14T08:00Z
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const decide = (token: string, id: string, body: unknown) => post(t, `/api/admin/facilities/${id}/decision`, body, auth(token))
const queue = async (token: string, q = '') => json(await get(t, `/api/admin/facilities${q}`, auth(token)))
const publicList = async () => json(await get(t, '/api/facilities'))

describe('admin access', () => {
	it('is 401 without a session and 403 for anyone who is not a super admin', async () => {
		const a = await applicant(t)
		for (const path of ['/api/admin/facilities', `/api/admin/facilities/${a.facility.id}`]) {
			expect((await get(t, path)).status).toBe(401)
			expect((await get(t, path, auth(a.body.accessToken))).status).toBe(403)
		}
		expect((await decide(a.body.accessToken, a.facility.id, { action: 'approve' })).status).toBe(403)
	})
})

describe('the queue and the list', () => {
	it('the queue holds pending and needs-info facilities, oldest first', async () => {
		const ad = await admin(t)
		const first = await applicant(t, { name: 'First Hospital' })
		t.clock.advance(60_000)
		const second = await applicant(t, { name: 'Second Hospital' })
		await decide(ad.body.accessToken, second.facility.id, { action: 'ask', text: 'A question' })
		t.clock.advance(60_000)
		const verified = await applicant(t, { name: 'Done Hospital' })
		await decide(ad.body.accessToken, verified.facility.id, { action: 'approve' })
		const rows = await queue(ad.body.accessToken, '?view=queue')
		expect(rows.map((r: any) => [r.name, r.status])).toEqual([['First Hospital', 'pending'], ['Second Hospital', 'needs_info']])
		expect(first.facility.id).toBe(rows[0].id)
	})
	it('can filter the queue by status, and the full list shows every status and can search', async () => {
		const ad = await admin(t)
		const a = await applicant(t, { name: 'Alpha Hospital', town: 'Nakuru' })
		await applicant(t, { name: 'Beta Clinic', town: 'Eldoret' })
		await decide(ad.body.accessToken, a.facility.id, { action: 'approve' })
		expect((await queue(ad.body.accessToken, '?view=queue&status=pending')).map((r: any) => r.name)).toEqual(['Beta Clinic'])
		expect((await queue(ad.body.accessToken)).map((r: any) => r.name).sort()).toEqual(['Alpha Hospital', 'Beta Clinic'])
		expect((await queue(ad.body.accessToken, '?q=eldoret')).map((r: any) => r.name)).toEqual(['Beta Clinic'])
	})
	it('flags a license number that two facilities share', async () => {
		const ad = await admin(t)
		await applicant(t, { name: 'One', licenseNumber: 'MSA-C-0877' })
		await applicant(t, { name: 'Two', licenseNumber: 'MSA-C-0877' })
		await applicant(t, { name: 'Three', licenseNumber: 'UG-H-0231' })
		const rows = await queue(ad.body.accessToken, '?view=queue')
		expect(Object.fromEntries(rows.map((r: any) => [r.name, r.duplicateLicense]))).toEqual({ One: true, Two: true, Three: false })
	})
})

describe('one application', () => {
	it('shows the facility, the applicant (phone masked), other facilities with the same license, and the reviewers\' notes', async () => {
		const ad = await admin(t)
		const a = await applicant(t, { name: 'Lakeview Hospital', licenseNumber: 'KSM-H-0102', role: 'Medical superintendent' }, { name: 'Achieng Ouma', phone: '0712345482' })
		await applicant(t, { name: 'Twin Clinic', licenseNumber: 'KSM-H-0102' })
		await decide(ad.body.accessToken, a.facility.id, { action: 'note', how: 'Called the facility', text: 'Switchboard confirmed Dr. Ouma.' })
		const d = await json(await get(t, `/api/admin/facilities/${a.facility.id}`, auth(ad.body.accessToken)))
		expect(d).toMatchObject({ name: 'Lakeview Hospital', licenseNumber: 'KSM-H-0102', lat: -0.0917, lng: 34.768, status: 'pending' })
		expect(d.applicant).toMatchObject({ name: 'Achieng Ouma', roleTitle: 'Medical superintendent', emailVerified: true, phoneVerified: false, phone: '+254 7•• ••• 482' })
		expect(d.duplicates.map((x: any) => x.name)).toEqual(['Twin Clinic'])
		expect(d.events.map((e: any) => [e.kind, e.byName])).toEqual([['submitted', 'Achieng Ouma'], ['note', ad.input.name]])
		expect(d.events[1]).toMatchObject({ how: 'Called the facility', text: 'Switchboard confirmed Dr. Ouma.', visible: false })
		expect((await get(t, '/api/admin/facilities/' + '0'.repeat(26), auth(ad.body.accessToken))).status).toBe(404)
	})
})

describe('decisions', () => {
	it('approve: verified, shows publicly, tells the applicant, and is logged', async () => {
		const ad = await admin(t)
		const a = await applicant(t, { name: 'Lakeview Hospital' })
		t.mail.sent.length = 0
		const res = await decide(ad.body.accessToken, a.facility.id, { action: 'approve', how: 'Called the facility', text: 'Confirmed.' })
		expect(res.status).toBe(200)
		expect((await json(res)).status).toBe('verified')
		expect((await publicList()).map((f: any) => f.name)).toEqual(['Lakeview Hospital'])
		expect(t.mail.sent).toHaveLength(1)
		expect(t.mail.sent[0].to).toBe(a.input.email)
		expect(t.mail.sent[0].text).toContain('Lakeview Hospital')
		const [audit] = (await t.pool.query("select actor_id, action, target from audit_log where action = 'facility_approve'")) as any
		expect(audit).toHaveLength(1)
		expect(audit[0].target).toBe(a.facility.id)
		const mine = await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))
		expect(mine.status).toBe('verified')
	})
	it('reject needs a reason; the applicant can read it', async () => {
		const ad = await admin(t)
		const a = await applicant(t)
		const none = await decide(ad.body.accessToken, a.facility.id, { action: 'reject' })
		expect(none.status).toBe(422)
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'reject', text: 'We could not confirm this with the licensing body.' })).status).toBe(200)
		const mine = await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))
		expect(mine.status).toBe('rejected')
		expect(mine.messages).toEqual([expect.objectContaining({ kind: 'reject', text: 'We could not confirm this with the licensing body.' })])
		expect(t.mail.sent.some((m) => m.to === a.input.email)).toBe(true)
	})
	it('ask needs a question; the applicant sees it and the status reads more information needed', async () => {
		const ad = await admin(t)
		const a = await applicant(t)
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'ask' })).status).toBe(422)
		await decide(ad.body.accessToken, a.facility.id, { action: 'ask', text: 'Please send the license as printed.' })
		const mine = await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))
		expect(mine.status).toBe('needs_info')
		expect(mine.messages[0]).toMatchObject({ kind: 'ask', text: 'Please send the license as printed.' })
	})
	it('a note changes nothing and stays hidden from the applicant', async () => {
		const ad = await admin(t)
		const a = await applicant(t)
		await decide(ad.body.accessToken, a.facility.id, { action: 'note', text: 'Rang twice, no answer.' })
		const mine = await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))
		expect(mine.status).toBe('pending')
		expect(mine.messages).toEqual([])
		expect(JSON.stringify(mine)).not.toContain('Rang twice')
	})
	it('suspend hides a verified facility and reactivate brings it back', async () => {
		const ad = await admin(t)
		const a = await applicant(t, { name: 'Lakeview Hospital' })
		await decide(ad.body.accessToken, a.facility.id, { action: 'approve' })
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'suspend', text: 'Misuse reported.' })).status).toBe(200)
		expect(await publicList()).toEqual([])
		expect((await json(await get(t, `/api/my-facilities/${a.facility.id}`, auth(a.body.accessToken)))).status).toBe('suspended')
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'reactivate' })).status).toBe(200)
		expect((await publicList()).map((f: any) => f.name)).toEqual(['Lakeview Hospital'])
	})
	it('moves that make no sense are 409: approve twice, reject a verified one, suspend a pending one, reactivate a verified one', async () => {
		const ad = await admin(t)
		const a = await applicant(t)
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'suspend', text: 'x' })).status).toBe(409)
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'reactivate' })).status).toBe(409)
		await decide(ad.body.accessToken, a.facility.id, { action: 'approve' })
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'approve' })).status).toBe(409)
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'reject', text: 'x' })).status).toBe(409)
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'reactivate' })).status).toBe(409)
	})
	it('an unknown facility is 404 and an unknown action is 422', async () => {
		const ad = await admin(t)
		const a = await applicant(t)
		expect((await decide(ad.body.accessToken, '0'.repeat(26), { action: 'approve' })).status).toBe(404)
		expect((await decide(ad.body.accessToken, a.facility.id, { action: 'delete' })).status).toBe(422)
	})
	it('every decision is written to the audit log with who did it and which facility', async () => {
		const ad = await admin(t)
		const a = await applicant(t)
		await decide(ad.body.accessToken, a.facility.id, { action: 'ask', text: 'Q?' })
		await post(t, `/api/my-facilities/${a.facility.id}/reply`, { text: 'A.' }, auth(a.body.accessToken))
		await decide(ad.body.accessToken, a.facility.id, { action: 'approve' })
		const [rows] = (await t.pool.query("select action, target from audit_log where action like 'facility_%' order by id")) as any
		expect(rows.map((r: any) => r.action)).toEqual(['facility_ask', 'facility_approve'])
		expect(rows.every((r: any) => r.target === a.facility.id)).toBe(true)
	})
})
