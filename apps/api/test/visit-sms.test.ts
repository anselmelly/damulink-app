import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTestApp, resetAccounts } from './helpers'
import { checkinDesk, donor, outcome, verifiedDonor } from './checkin-helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const lastText = () => t.sms.sent.filter((m) => !/your code is/i.test(m.text)).at(-1)

describe('texts after a visit', () => {
	it('a donation: thanks and the next eligible date (woman 4 months, man 3)', async () => {
		const d = await checkinDesk(t)
		const w = await verifiedDonor(t)
		const m = await verifiedDonor(t, {}, { sex: 'male', name: 'Daniel Cheruiyot' })
		await outcome(t, d.token, d.id, w.code, { outcome: 'donated' })
		expect(lastText()!.text).toContain('14 March 2027')
		await outcome(t, d.token, d.id, m.code, { outcome: 'donated' })
		expect(lastText()!.text).toContain('14 February 2027')
		expect(lastText()!.to).toBe(m.input.phone.startsWith('+') ? m.input.phone : `+254${m.input.phone.slice(1)}`)
	})

	it('a test with a type: "you are verified" with the blood type', async () => {
		const d = await checkinDesk(t)
		const p = await donor(t)
		await outcome(t, d.token, d.id, p.code, { outcome: 'test', bloodType: 'AB+' })
		expect(lastText()!.text).toMatch(/verified/i)
		expect(lastText()!.text).toContain('AB+')
	})

	it('opted-out donors get nothing', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t, { sms_opt_in: 0 }, { smsOptIn: false })
		const before = t.sms.sent.length
		await outcome(t, d.token, d.id, p.code, { outcome: 'donated' })
		expect(t.sms.sent.length).toBe(before)
	})

	it('a text carries no more than the blood type and a date: no bag number, weight, facility patient or code', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		await outcome(t, d.token, d.id, p.code, { outcome: 'donated', weightKg: 61.5, bagNumber: 'SECRET-BAG' })
		const text = lastText()!.text
		for (const bad of ['SECRET-BAG', '61.5', p.code]) expect(text).not.toContain(bad)
	})

	it('a failing SMS provider never undoes the recorded visit', async () => {
		const d = await checkinDesk(t)
		const p = await verifiedDonor(t)
		const send = t.sms.send.bind(t.sms)
		t.sms.send = async () => {
			throw new Error('provider down')
		}
		const res = await outcome(t, d.token, d.id, p.code, { outcome: 'donated' })
		t.sms.send = send
		expect(res.status).toBe(201)
	})
})
