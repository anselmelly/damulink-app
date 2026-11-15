import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { approved, cq, detail, publish, publishBody } from './call-helpers'
import { call, confirmBody, desk, fq, sent } from './request-helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())

describe('publishing an approved request as a call', () => {
	it('any team member can publish; the call is live for 3 days and the request becomes published', async () => {
		const a = await approved(t)
		const res = await publish(t, a.attendant.body.accessToken, a.id, a.r.id)
		expect(res.status).toBe(201)
		const c = await json(res)
		expect(c).toMatchObject({ status: 'live', number: 'CALL-0001' })
		expect(c.short).toMatch(/^[a-z0-9]{4,6}$/)
		expect(new Date(c.closesAt).getTime() - t.clock.now().getTime()).toBe(3 * 86_400_000)
		const req = await json(await get(t, fq(a.id, `/${a.r.id}`), auth(a.adminToken)))
		expect(req.status).toBe('published')
		expect(req.timeline.map((e: any) => e.kind)).toEqual(['sent', 'confirmed', 'approved', 'published'])
	})
	it('only an approved request can be published (409), and only once', async () => {
		const d = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id)
		expect((await publish(t, d.adminToken, d.id, r.id)).status).toBe(409)
		await call(t, 'POST', fq(d.id, `/${r.id}/confirm`), d.adminToken, confirmBody)
		expect((await publish(t, d.adminToken, d.id, r.id)).status).toBe(409)
		await call(t, 'POST', fq(d.id, `/${r.id}/approve`), d.adminToken)
		expect((await publish(t, d.adminToken, d.id, r.id)).status).toBe(201)
		const again = await publish(t, d.adminToken, d.id, r.id)
		expect(again.status).toBe(409)
		expect((await json(again)).error.code).toBe('invalid_move')
	})
	it('people outside the team see not found', async () => {
		const a = await approved(t)
		const other = await desk(t)
		expect((await publish(t, other.adminToken, other.id, a.r.id)).status).toBe(404)
		expect((await publish(t, other.adminToken, a.id, a.r.id)).status).toBe(404)
	})
	it('the donor types may narrow the compatible set but never add to it', async () => {
		const a = await approved(t)
		const bad = await publish(t, a.adminToken, a.id, a.r.id, { types: ['A+', 'B+'] })
		expect(bad.status).toBe(422)
		expect((await json(bad)).error.fields.types).toBeTruthy()
		expect((await publish(t, a.adminToken, a.id, a.r.id, { types: [] })).status).toBe(422)
		expect((await publish(t, a.adminToken, a.id, a.r.id, { types: ['O-'] })).status).toBe(201)
	})
	it('the public text is at most 140 characters and carries no patient details', async () => {
		const a = await approved(t, { patientName: 'Wanjiku Kamau', patientRef: 'Ward 4, bed 12' })
		for (const publicText of ['x'.repeat(141), 'Please help Wanjiku', 'Needed in ward 4', '']) {
			const res = await publish(t, a.adminToken, a.id, a.r.id, { publicText })
			expect(res.status, publicText).toBe(422)
			expect((await json(res)).error.fields.publicText).toBeTruthy()
		}
	})
	it('needs at least one of the public page and SMS; SMS cannot be switched on yet', async () => {
		const a = await approved(t)
		expect((await publish(t, a.adminToken, a.id, a.r.id, { isPublic: false, smsEnabled: false })).status).toBe(422)
		const sms = await publish(t, a.adminToken, a.id, a.r.id, { smsEnabled: true })
		expect(sms.status).toBe(422)
		expect((await json(sms)).error.fields.smsEnabled).toBeTruthy()
	})
	it('a facility that is not verified cannot publish', async () => {
		const a = await approved(t)
		await t.pool.query(`update facilities set status = 'suspended' where id = ?`, [a.id])
		expect((await publish(t, a.adminToken, a.id, a.r.id)).status).toBe(403)
	})
	it('the preview gives the compatible types, a suggested text and the limits', async () => {
		const a = await approved(t)
		const p = await json(await get(t, fq(a.id, `/${a.r.id}/publish-preview`), auth(a.attendant.body.accessToken)))
		expect(p.compatibleTypes.sort()).toEqual(['A+', 'A-', 'O+', 'O-'])
		expect(p.suggestedText).toBe('We are appealing for A+ blood. Please share this call.')
		expect(p).toMatchObject({ textMax: 140, urgency: 'normal' })
	})
	it('the urgency can be raised when publishing, and is kept on the call', async () => {
		const a = await approved(t)
		const c = await json(await publish(t, a.adminToken, a.id, a.r.id, { urgency: 'urgent' }))
		expect((await detail(t, a.adminToken, a.id, c.id)).urgency).toBe('urgent')
	})
	it('call numbers run on', async () => {
		const a = await approved(t)
		const b = await approved(t)
		await publish(t, a.adminToken, a.id, a.r.id)
		expect((await json(await publish(t, b.adminToken, b.id, b.r.id))).number).toBe('CALL-0002')
	})
	it('lists the facility calls for the team only', async () => {
		const a = await approved(t)
		await publish(t, a.adminToken, a.id, a.r.id)
		const list = await json(await get(t, cq(a.id), auth(a.attendant.body.accessToken)))
		expect(list.items).toHaveLength(1)
		expect(list.items[0]).toMatchObject({ number: 'CALL-0001', status: 'live', bloodType: 'A+' })
		expect((await get(t, cq(a.id), auth(a.who.body.accessToken))).status).toBe(404)
	})
	it('publishBody is valid by default', () => expect(publishBody().types).toHaveLength(4))
})
