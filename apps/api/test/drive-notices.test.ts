import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { makeTestApp, resetAccounts } from './helpers'
import { call } from './request-helpers'
import { donor } from './checkin-helpers'
import { driveDesk, dv, made, publishDrive, say } from './drive-helpers'

const clock = fixedClock('2026-11-14T08:00:00Z')
const t = makeTestApp({ clock })
beforeEach(async () => {
	clock.set('2026-11-14T08:00:00Z')
	await resetAccounts(t)
	t.sms.sent.length = 0
})
afterAll(() => t.pool.end())
const rows = async (sql: string, args: unknown[] = []) => ((await t.pool.query(sql, args)) as any)[0] as any[]
const texts = () => t.sms.sent.filter((s) => /blood drive/i.test(s.text))
const to = (phone: string) => texts().filter((s) => s.to === phone)

async function withInterest() {
	const d = await driveDesk(t)
	const m = await made(t, d, { date: '2026-11-21' })
	await publishDrive(t, d, m.id)
	await say(t, m.code, { name: 'Peter Mwangi', phone: '0722111377' })
	await say(t, m.code, { name: 'Grace Chebet' }) // no phone: nobody to text
	const member = await donor(t, {}, { name: 'Brian Otieno' })
	await t.pool.query('update users set sms_opt_in = 1 where id = ?', [member.id])
	await say(t, m.code, undefined, { 'X-Auth': member.body.accessToken })
	const out = await donor(t, {}, { name: 'Kevin Mutua' })
	await t.pool.query('update users set sms_opt_in = 0 where id = ?', [out.id])
	await say(t, m.code, undefined, { 'X-Auth': out.body.accessToken })
	t.sms.sent.length = 0
	return { d, m, member, out }
}
const patch = (d: { token: string; id: string }, id: string, body: unknown) => call(t, 'PATCH', dv(d.id, `/${id}`), d.token, body)
const cancel = (d: { token: string; id: string }, id: string) => call(t, 'POST', dv(d.id, `/${id}/cancel`), d.token)

describe('cancelling a drive', () => {
	it('texts interested guests with a phone and signed-in donors with SMS on, once, then deletes the list', async () => {
		const { d, m, member } = await withInterest()
		expect((await cancel(d, m.id)).status).toBe(200)
		const sent = texts()
		expect(sent).toHaveLength(2)
		expect(to('+254722111377')).toHaveLength(1)
		expect(to((await rows('select phone from users where id = ?', [member.id]))[0].phone)).toHaveLength(1)
		for (const s of sent) {
			expect(s.text).toMatch(/cancelled/i)
			expect(s.text).toContain('Greenfield Secondary School')
			expect(s.text).toContain('Sat 21 Nov')
			expect(s.text).not.toMatch(/Otieno|0712345678|254712345678/)
			expect(s.text).toMatch(/STOP/)
		}
		expect((await rows('select count(*) n from drive_interest'))[0].n).toBe(0)
	})

	it('a draft that is cancelled, or a drive nobody is interested in, texts nobody', async () => {
		const d = await driveDesk(t)
		const draft = await made(t, d)
		await cancel(d, draft.id)
		const m = await made(t, d, { date: '2026-11-22' })
		await publishDrive(t, d, m.id)
		await cancel(d, m.id)
		expect(texts()).toHaveLength(0)
	})
})

describe('changing a published drive', () => {
	it('a new time, date or venue texts the same people the new details', async () => {
		const { d, m } = await withInterest()
		expect((await patch(d, m.id, { starts: '10:00', ends: '16:00' })).status).toBe(200)
		const sent = texts()
		expect(sent).toHaveLength(2)
		for (const s of sent) {
			expect(s.text).toMatch(/changed/i)
			expect(s.text).toContain('10:00-16:00')
			expect(s.text).toContain(m.short)
			expect(s.text).not.toMatch(/Otieno|254712345678/)
		}
		expect((await rows('select count(*) n from drive_interest'))[0].n).toBe(4) // the list stays: the drive is still on
	})

	it('editing only the public text, the target or the contact texts nobody', async () => {
		const { d, m } = await withInterest()
		await patch(d, m.id, { publicText: 'New words for the page, thank you.', target: 50, contactName: 'Someone Else' })
		expect(texts()).toHaveLength(0)
	})

	it('editing a draft texts nobody', async () => {
		const d = await driveDesk(t)
		const m = await made(t, d)
		await patch(d, m.id, { venue: 'Elsewhere' })
		expect(texts()).toHaveLength(0)
	})

	it('donors who turned SMS off, and guests without a phone, are never texted', async () => {
		const { d, m, out } = await withInterest()
		await patch(d, m.id, { venue: 'The new hall' })
		const phone = (await rows('select phone from users where id = ?', [out.id]))[0].phone
		expect(to(phone)).toHaveLength(0)
		expect(texts()).toHaveLength(2)
	})
})
