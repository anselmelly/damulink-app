import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { listAudit } from '@damu/db'
import { auth, get, json, makeTestApp, resetAccounts } from './helpers'
import { call, confirmBody, desk, fq, requester, sent } from './request-helpers'

const t = makeTestApp()
beforeEach(async () => {
	await resetAccounts(t)
	t.mail.sent.length = 0
})
afterAll(() => t.pool.end())
const PATIENT = 'Zebediah Otieno'
const REF = 'Ward 7 bed 31'

describe('patient details stay with the requester and the facility', () => {
	it('shows them to the requester and the facility team, and to nobody else', async () => {
		const d = await desk(t)
		const other = await desk(t)
		const r = await sent(t, d.who.body.accessToken, d.id, { patientName: PATIENT, patientRef: REF })
		const seen = async (path: string, token: string) => JSON.stringify(await json(await get(t, path, auth(token))))
		expect(await seen(`/api/requests/${r.id}`, d.who.body.accessToken)).toContain(PATIENT)
		expect(await seen(fq(d.id, `/${r.id}`), d.attendant.body.accessToken)).toContain(PATIENT)
		expect(await seen(fq(d.id), d.attendant.body.accessToken)).toContain(REF)
		const stranger = await requester(t)
		for (const [path, token] of [[`/api/requests/${r.id}`, stranger.body.accessToken], [fq(d.id, `/${r.id}`), stranger.body.accessToken], [fq(d.id, `/${r.id}`), other.adminToken], [fq(d.id), other.adminToken]] as const) {
			const body = await seen(path, token)
			expect(body).not.toContain(PATIENT)
			expect(body).not.toContain(REF)
		}
	})

	it('never goes into an email, the audit log, the events, or the logs', async () => {
		const logs: string[] = []
		const spies = (['log', 'error', 'warn', 'info'] as const).map((k) => {
			const orig = console[k]
			console[k] = (...a: unknown[]) => void logs.push(a.map(String).join(' '))
			return () => void (console[k] = orig)
		})
		try {
			const d = await desk(t)
			const r = await sent(t, d.who.body.accessToken, d.id, { patientName: PATIENT, patientRef: REF })
			await call(t, 'POST', fq(d.id, `/${r.id}/ask`), d.adminToken, { question: 'Please confirm the ward' })
			await call(t, 'POST', `/api/requests/${r.id}/reply`, d.who.body.accessToken, { message: 'Ward 7' })
			await call(t, 'POST', fq(d.id, `/${r.id}/confirm`), d.adminToken, confirmBody)
			await call(t, 'POST', fq(d.id, `/${r.id}/approve`), d.adminToken)
			const audit = JSON.stringify(await listAudit(t.db, 100))
			const [events] = await t.pool.query('select * from request_events')
			const everything = JSON.stringify([t.mail.sent, audit, events, logs])
			expect(everything).not.toContain(PATIENT)
			expect(everything).not.toContain(REF)
			expect(t.mail.sent.length).toBeGreaterThanOrEqual(2)
		} finally {
			spies.forEach((s) => s())
		}
	})
})
