import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { listAudit } from '@damu/db'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { call, confirmBody, desk, fq, member, requester, sent } from './request-helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const detail = async (token: string, id: string, rid: string) => json(await get(t, fq(id, `/${rid}`), auth(token)))
const act = (token: string, id: string, rid: string, what: string, body?: unknown) => call(t, 'POST', fq(id, `/${rid}/${what}`), token, body)

describe('confirming offline', () => {
  it('records the values and an event, and any team member may do it', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id, { bloodType: 'unsure', units: 5 })
		const res = await act(d.attendant.body.accessToken, d.id, r.id, 'confirm', { bloodType: 'B-', units: 3, urgency: 'urgent' })
		expect(res.status).toBe(200)
		const det = await detail(d.attendant.body.accessToken, d.id, r.id)
		expect(det).toMatchObject({ status: 'confirmed', blood: { bloodType: 'B-', units: 3, urgency: 'urgent' } })
		expect(det.timeline.map((e: any) => e.kind)).toEqual(['sent', 'confirmed'])
	})
	it('needs a real blood type and 1 to 10 units', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		expect((await act(d.adminToken, d.id, r.id, 'confirm', { ...confirmBody, bloodType: 'unsure' })).status).toBe(422)
		expect((await act(d.adminToken, d.id, r.id, 'confirm', { ...confirmBody, units: 0 })).status).toBe(422)
	})
})

describe('approving and rejecting', () => {
	it('approval comes only after confirming (409 invalid_move)', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		const res = await act(d.adminToken, d.id, r.id, 'approve')
		expect(res.status).toBe(409)
		expect((await json(res)).error.code).toBe('invalid_move')
	})
	it('needs admin or the approval permission (403 not_approver), and an admin can grant it', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		await act(d.attendant.body.accessToken, d.id, r.id, 'confirm', confirmBody)
		const denied = await act(d.attendant.body.accessToken, d.id, r.id, 'approve')
		expect(denied.status).toBe(403)
		expect((await json(denied)).error.code).toBe('not_approver')
		expect((await act(d.attendant.body.accessToken, d.id, r.id, 'reject', { reason: 'other' })).status).toBe(403)
		// the admin grants it with the toggle, and the attendant may then approve
		const perm = (token: string) => call(t, 'POST', `/api/my-facilities/${d.id}/members/${d.attendant.body.user.id}/permissions`, token, { canApprove: true })
		expect((await perm(d.attendant.body.accessToken)).status).toBe(403) // an attendant cannot grant it, even to self
		expect((await perm(d.adminToken)).status).toBe(200)
		const members = await json(await get(t, `/api/my-facilities/${d.id}/members`, auth(d.adminToken)))
		expect(members.find((m: any) => m.userId === d.attendant.body.user.id).canApprove).toBe(true)
		expect((await act(d.attendant.body.accessToken, d.id, r.id, 'approve')).status).toBe(200)
	})
	it('lets an approver attendant and an admin approve, and the requester is emailed without patient details', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		await act(d.attendant.body.accessToken, d.id, r.id, 'confirm', confirmBody)
		t.mail.sent.length = 0
		expect((await act(d.approver.body.accessToken, d.id, r.id, 'approve')).status).toBe(200)
		expect((await detail(d.adminToken, d.id, r.id)).status).toBe('approved')
		const mail = t.mail.sent.at(-1)!
		expect(mail.to).toBe(d.who.input.email)
		expect(mail.text).toContain(r.number)
		expect(mail.subject + mail.text).not.toMatch(/Test Patient|Ward \d/)
	})
	it('a reject needs a reason from the list; the message reaches the requester by email and in the app', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		expect((await act(d.adminToken, d.id, r.id, 'reject', {})).status).toBe(422)
		expect((await act(d.adminToken, d.id, r.id, 'reject', { reason: 'because' })).status).toBe(422)
		t.mail.sent.length = 0
		expect((await act(d.adminToken, d.id, r.id, 'reject', { reason: 'no_match', message: 'No stock today' })).status).toBe(200)
		expect(t.mail.sent.at(-1)!.text).toContain('No stock today')
		expect((await act(d.adminToken, d.id, r.id, 'approve')).status).toBe(409)
	})
	it('asking takes a question, moves to needs_info and emails the requester', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		expect((await act(d.attendant.body.accessToken, d.id, r.id, 'ask', { question: '' })).status).toBe(422)
		t.mail.sent.length = 0
		expect((await act(d.attendant.body.accessToken, d.id, r.id, 'ask', { question: 'Which doctor referred you?' })).status).toBe(200)
		expect((await detail(d.adminToken, d.id, r.id)).status).toBe('needs_info')
		expect(t.mail.sent.at(-1)).toMatchObject({ to: d.who.input.email })
		expect(t.mail.sent.at(-1)!.text).toContain('Which doctor referred you?')
	})
	it('a mail outage does not undo the decision', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		const real = t.mail.send.bind(t.mail)
		t.mail.send = async () => { throw new Error('provider down') }
		try {
			expect((await act(d.adminToken, d.id, r.id, 'reject', { reason: 'other' })).status).toBe(200)
		} finally {
			t.mail.send = real
		}
		expect((await detail(d.adminToken, d.id, r.id)).status).toBe('rejected')
	})
})

describe('the allowed moves, as a table', () => {
	// status reached -> actions that must work (200) and ones that must be refused (409)
	const setups: Record<string, (d: Awaited<ReturnType<typeof desk>>, id: string) => Promise<void>> = {
		pending: async () => {},
		needs_info: async (d, id) => void (await act(d.adminToken, d.id, id, 'ask', { question: 'Q?' })),
		confirmed: async (d, id) => void (await act(d.adminToken, d.id, id, 'confirm', confirmBody)),
		approved: async (d, id) => {
			await act(d.adminToken, d.id, id, 'confirm', confirmBody)
			await act(d.adminToken, d.id, id, 'approve')
		},
		rejected: async (d, id) => void (await act(d.adminToken, d.id, id, 'reject', { reason: 'other' })),
	}
	const allowed: Record<string, string[]> = {
		pending: ['confirm', 'ask', 'reject'],
		needs_info: [],
		confirmed: ['approve', 'ask', 'reject'],
		approved: [],
		rejected: [],
	}
	const bodies: Record<string, unknown> = { confirm: confirmBody, ask: { question: 'More?' }, reject: { reason: 'other' }, approve: undefined }
	for (const [status, setup] of Object.entries(setups)) {
		for (const action of ['confirm', 'approve', 'reject', 'ask']) {
			const ok = allowed[status].includes(action)
			it(`from ${status}, ${action} is ${ok ? 'allowed' : 'refused'}`, async () => {
				const d = await desk(t)
				const r = await sent(t, d.who.body.accessToken, d.id)
				await setup(d, r.id)
				expect((await detail(d.adminToken, d.id, r.id)).status).toBe(status)
				const res = await act(d.adminToken, d.id, r.id, action, bodies[action])
				expect(res.status).toBe(ok ? 200 : 409)
			})
		}
	}
})

describe('who may act, and on what', () => {
	it('a suspended or unverified facility may not decide (403 facility_not_verified)', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		await t.pool.query('update facilities set status = ? where id = ?', ['suspended', d.id])
		const res = await act(d.adminToken, d.id, r.id, 'confirm', confirmBody)
		expect(res.status).toBe(403)
		expect((await json(res)).error.code).toBe('facility_not_verified')
	})
	it('another facility cannot touch a request (404), and a missing one is 404', async () => {
		const d = await desk(t)
		const other = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		expect((await act(other.adminToken, other.id, r.id, 'confirm', confirmBody)).status).toBe(404)
		expect((await act(d.adminToken, d.id, '0'.repeat(26), 'confirm', confirmBody)).status).toBe(404)
	})
	it('shows the requester summary with a masked phone and honest counts', async () => {
		const d = await desk(t)
		const tok = d.who.body.accessToken
		const a = await sent(t, tok, d.id)
		await act(d.adminToken, d.id, a.id, 'reject', { reason: 'other' })
		const b = await sent(t, tok, d.id)
		await call(t, 'POST', `/api/requests/${b.id}/cancel`, tok)
		const c = await sent(t, tok, d.id)
		const det = await detail(d.attendant.body.accessToken, d.id, c.id)
		expect(det.requester).toMatchObject({ name: d.who.body.user.name, total: 3, rejected: 1, cancelled: 1 })
		expect(det.requester.phone).toMatch(/•/)
		expect(det.requester.phone).not.toContain(d.who.input.phone.slice(4, 8))
	})
	it('writes every decision to the audit log', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		await act(d.adminToken, d.id, r.id, 'confirm', confirmBody)
		await act(d.adminToken, d.id, r.id, 'approve')
		const actions = (await listAudit(t.db, 20)).map((a) => a.action)
		expect(actions).toEqual(expect.arrayContaining(['request.confirm', 'request.approve']))
	})
})
