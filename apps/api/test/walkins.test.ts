import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { checkinDesk, walkinUrl } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const body = (over: Record<string, unknown> = {}) => ({ name: 'Peter Mwangi', sex: 'male', dateOfBirth: '1990-03-02', outcome: 'donated', ...over })

describe('walk-ins', () => {
	it('records a donation without creating an account or keeping contact details', async () => {
		const d = await checkinDesk(t)
		const users = (await rows(`select count(*) n from users`))[0].n
		const res = await call(t, 'POST', walkinUrl(d.id), d.token, body({ weightKg: 70, bagNumber: 'W-1', bloodType: 'B+' }))
		expect(res.status).toBe(201)
		expect((await rows(`select count(*) n from users`))[0].n).toBe(users)
		const [w] = await rows(`select * from walkin_visits`)
		expect(w).toMatchObject({ facility_id: d.id, name: 'Peter Mwangi', outcome: 'donated', blood_type: 'B+', bag_number: 'W-1', recorded_by: d.attendant.body.user.id, invite_phone: null })
		expect(Object.keys(w).join(' ')).not.toMatch(/email/)
	})

	it('weight is optional; under 50 kg warns; age 18 to 65 is strict for a donation', async () => {
		const d = await checkinDesk(t)
		expect((await call(t, 'POST', walkinUrl(d.id), d.token, body())).status).toBe(201)
		expect((await json(await call(t, 'POST', walkinUrl(d.id), d.token, body({ weightKg: 46 })))).warning).toBe('weight_low')
		expect((await call(t, 'POST', walkinUrl(d.id), d.token, body({ dateOfBirth: '2012-01-01' }))).status).toBe(422)
		expect((await call(t, 'POST', walkinUrl(d.id), d.token, body({ dateOfBirth: '1950-01-01' }))).status).toBe(422)
		// a test or a deferral does not need the age
		expect((await call(t, 'POST', walkinUrl(d.id), d.token, body({ dateOfBirth: '2012-01-01', outcome: 'deferred' }))).status).toBe(201)
	})

	it('with an invitation phone: one text with the sign-up link, then the number is gone', async () => {
		const d = await checkinDesk(t)
		t.sms.sent.length = 0
		const res = await call(t, 'POST', walkinUrl(d.id), d.token, body({ invitePhone: '0712345678' }))
		expect(res.status).toBe(201)
		expect((await json(res)).inviteSent).toBe(true)
		expect(t.sms.sent).toHaveLength(1)
		expect(t.sms.sent[0].to).toBe('+254712345678')
		expect(t.sms.sent[0].text).toContain('/join/')
		expect((await rows(`select invite_phone from walkin_visits`))[0].invite_phone).toBeNull()
		expect(JSON.stringify(await rows(`select * from audit_log`))).not.toContain('712345678')
	})

	it('a bad phone is 422 and nothing is stored', async () => {
		const d = await checkinDesk(t)
		expect((await call(t, 'POST', walkinUrl(d.id), d.token, body({ invitePhone: '123' }))).status).toBe(422)
		expect(await rows(`select id from walkin_visits`)).toHaveLength(0)
	})

	it('no text without a phone; team of a verified facility only; audited', async () => {
		const d = await checkinDesk(t)
		t.sms.sent.length = 0
		await call(t, 'POST', walkinUrl(d.id), d.token, body())
		expect(t.sms.sent).toHaveLength(0)
		expect((await call(t, 'POST', walkinUrl(d.id), d.who.body.accessToken, body())).status).toBe(404)
		expect((await rows(`select action from audit_log where action = 'walkin.record'`))).toHaveLength(1)
	})
})
