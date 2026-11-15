import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { json, makeTestApp, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { checkinDesk, donor, lab, outcome } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]

async function pending(d: Awaited<ReturnType<typeof checkinDesk>>) {
	const p = await donor(t)
	await outcome(t, d.token, d.id, p.code, { outcome: 'donated', bagNumber: 'RC-1171' })
	const list = await json(await call(t, 'GET', lab(d.id), d.token))
	return { p, sample: list[0] }
}

describe('lab results', () => {
	it('lists this facility\'s waiting samples with name, code, source, date and reference', async () => {
		const d = await checkinDesk(t)
		const { p, sample } = await pending(d)
		expect(sample).toMatchObject({ name: 'Faith Wambui', code: p.code, source: 'donation', sampleRef: 'RC-1171' })
		expect(sample.on).toMatch(/^2026-11-14/)
		const other = await checkinDesk(t)
		expect(await json(await call(t, 'GET', lab(other.id), other.token))).toEqual([])
		expect((await call(t, 'GET', lab(d.id), other.token)).status).toBe(404)
	})

	it('entering a type verifies the donor, closes the sample and texts them', async () => {
		const d = await checkinDesk(t)
		const { p, sample } = await pending(d)
		t.sms.sent.length = 0
		const res = await call(t, 'POST', lab(d.id, `/${sample.id}/result`), d.token, { bloodType: 'A+' })
		expect(res.status).toBe(200)
		expect((await rows(`select blood_type from users where id = ?`, [p.id]))[0].blood_type).toBe('A+')
		expect((await rows(`select status, resulted_by from lab_samples`))[0]).toMatchObject({ status: 'resulted', resulted_by: d.attendant.body.user.id })
		expect(await json(await call(t, 'GET', lab(d.id), d.token))).toEqual([])
		expect(t.sms.sent).toHaveLength(1)
		expect(t.sms.sent[0].text).toContain('A+')
	})

	it('a bad type is 422, a second entry 409, an unknown or other facility\'s sample 404', async () => {
		const d = await checkinDesk(t)
		const { sample } = await pending(d)
		expect((await call(t, 'POST', lab(d.id, `/${sample.id}/result`), d.token, { bloodType: 'C+' })).status).toBe(422)
		expect((await call(t, 'POST', lab(d.id, `/${sample.id}/result`), d.token, { bloodType: 'A+' })).status).toBe(200)
		expect((await call(t, 'POST', lab(d.id, `/${sample.id}/result`), d.token, { bloodType: 'A+' })).status).toBe(409)
		expect((await call(t, 'POST', lab(d.id, '/nope/result'), d.token, { bloodType: 'A+' })).status).toBe(404)
		const o = await checkinDesk(t)
		const { sample: s2 } = await pending(d)
		expect((await call(t, 'POST', lab(o.id, `/${s2.id}/result`), o.token, { bloodType: 'A+' })).status).toBe(404)
	})

	it('a donor who is already verified with another type: 409 type_conflict', async () => {
		const d = await checkinDesk(t)
		const { p, sample } = await pending(d)
		await t.pool.query(`update users set blood_type = 'O-' where id = ?`, [p.id])
		const res = await call(t, 'POST', lab(d.id, `/${sample.id}/result`), d.token, { bloodType: 'A+' })
		expect(res.status).toBe(409)
		expect((await json(res)).error.code).toBe('type_conflict')
	})
})
