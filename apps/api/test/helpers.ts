import { makeDb, facilities } from '@damu/db'
import { sql } from 'drizzle-orm'
import { createApp } from '../src/app'
import { type Clock, fixedClock } from '../src/lib/clock'
import { newId } from '../src/lib/id'
import { MemoryOutbox, type MailMessage, type SmsMessage } from '../src/lib/services'

export type TestClock = ReturnType<typeof fixedClock>
export const TEST_SECRET = 'test-secret-test-secret-test-secret-0123456789'

/** One app over the test database. The pool is shared by the file; tests clear the tables they use. */
export function makeTestApp(opts: { clock?: Clock; allowedOrigins?: string[]; fixedOtp?: string } = {}) {
	const { db, pool } = makeDb({
		host: process.env.DB_HOST ?? '127.0.0.1',
		port: Number(process.env.DB_PORT ?? 3306),
		user: process.env.DB_USER!,
		password: process.env.DB_PASSWORD!,
		database: process.env.TEST_DB_NAME!,
	})
	const clock = (opts.clock as TestClock | undefined) ?? fixedClock('2026-11-14T08:00:00Z')
	const mail = new MemoryOutbox<MailMessage>()
	const sms = new MemoryOutbox<SmsMessage>()
	const app = createApp({
		db,
		clock,
		mailer: mail,
		sms,
		config: { jwtSecret: TEST_SECRET, pbkdf2Iterations: 1000, fixedOtp: opts.fixedOtp, appUrl: 'http://localhost:5173', allowedOrigins: opts.allowedOrigins ?? ['http://localhost:5173'] },
	})
	return { app, db, pool, clock, mail, sms }
}
export type TestApp = ReturnType<typeof makeTestApp>

export async function json<T = any>(res: Response): Promise<T> {
	return (await res.json()) as T
}

/** Empties the tables phase 1 uses. TRUNCATE skips the audit log's delete guard on purpose. */
export async function resetAccounts({ db }: TestApp) {
	await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
	for (const t of ['facility_invites', 'audit_log', 'facility_events', 'facility_members', 'donor_prefs', 'donation_requests', 'auth_tokens', 'phone_otps', 'users', 'user_extra_facilities', 'facility_requests', 'blood_requests', 'request_events', 'calls', 'call_responses', 'refresh_tokens', 'rate_limits', 'facilities']) await db.execute(sql.raw(`TRUNCATE TABLE \`${t}\``))
	await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
}

export async function addFacility(t: TestApp, name = 'Rift County Hospital', town = 'Nakuru', status: 'verified' | 'pending' = 'verified') {
	const id = newId()
	await t.db.insert(facilities).values({ id, name, type: 'hospital', town, county: town, status })
	return id
}

export function post(t: TestApp, path: string, body: unknown, headers: Record<string, string> = {}) {
	return t.app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
export function get(t: TestApp, path: string, headers: Record<string, string> = {}) {
	return t.app.request(path, { headers })
}

let n = 0
export const signupBody = (over: Record<string, unknown> = {}) => ({
	name: 'Amina Wanjiru',
	email: `amina${++n}@example.com`,
	phone: `0712${String(100000 + n).slice(-6)}`,
	password: 'correct-horse',
	sex: 'female',
	dateOfBirth: '1996-04-12',
	smsOptIn: true,
	...over,
})

/** Signs up through the API and returns the response body (tokens and user) plus the input. */
export async function signup(t: TestApp, over: Record<string, unknown> = {}) {
	const input = signupBody(over)
	const res = await post(t, '/api/auth/signup', input)
	const body = await json(res)
	return { res, body, input }
}
export async function login(t: TestApp, email: string, password: string) {
	return post(t, '/api/auth/login', { email, password })
}
export const auth = (token: string) => ({ 'X-Auth': token })

/** The link token in the most recent email to `to` (or the latest email at all). */
export function emailToken(t: TestApp, to?: string): string {
	const m = [...t.mail.sent].reverse().find((x) => !to || x.to === to)
	const tok = m?.text.match(/token=([\w-]+)/)?.[1]
	if (!tok) throw new Error('no email token found')
	return tok
}
/** The six-digit code in the most recent SMS. */
export function smsCode(t: TestApp): string {
	const code = [...t.sms.sent].reverse()[0]?.text.match(/\b(\d{6})\b/)?.[1]
	if (!code) throw new Error('no sms code found')
	return code
}

/** Sets facts a medical facility will record later (blood type, weight, last donation), and phone verification, straight in the database. */
export async function setDonorFacts(t: TestApp, email: string, facts: Record<string, unknown>) {
	const sets = Object.keys(facts).map((k) => `\`${k}\` = ?`).join(', ')
	await t.pool.query(`update users set ${sets} where email = ?`, [...Object.values(facts), email])
}
export const verifyPhone = (t: TestApp, email: string) => setDonorFacts(t, email, { phone_verified_at: new Date('2026-11-14T07:00:00Z') })

export const makeSuperAdmin = (t: TestApp, email: string) => setDonorFacts(t, email, { is_super_admin: 1 })
export const verifyEmail = (t: TestApp, email: string) => setDonorFacts(t, email, { email_verified_at: new Date('2026-11-14T07:00:00Z') })

let nf = 0
export const facilityBody = (over: Record<string, unknown> = {}) => ({
	name: `Lakeview Hospital ${++nf}`,
	type: 'hospital',
	licenseNumber: `KSM-H-${String(1000 + nf)}`,
	county: 'Kisumu',
	town: 'Kisumu',
	lat: -0.0917,
	lng: 34.768,
	phone: '+254 57 202 0000',
	email: `lab${nf}@lakeview.example`,
	role: 'Medical superintendent',
	authorised: true,
	...over,
})
/** A signed-up user with a verified email who submits a facility. */
export async function applicant(t: TestApp, facility: Record<string, unknown> = {}, userOver: Record<string, unknown> = {}) {
	const s = await signup(t, userOver)
	await verifyEmail(t, s.input.email)
	const res = await post(t, '/api/facilities', facilityBody(facility), auth(s.body.accessToken))
	return { ...s, res, facility: res.status === 201 ? await json(res) : null }
}
/** A signed-up super admin. */
export async function admin(t: TestApp) {
	const s = await signup(t)
	await makeSuperAdmin(t, s.input.email)
	return s
}

export const decideAs = (t: TestApp, token: string, id: string, body: unknown) => post(t, `/api/admin/facilities/${id}/decision`, body, auth(token))
/** A facility that a super admin has approved, with its admin (the applicant). */
export async function verifiedFacility(t: TestApp, facility: Record<string, unknown> = {}) {
	const owner = await applicant(t, facility)
	const ad = await admin(t)
	await decideAs(t, ad.body.accessToken, owner.facility.id, { action: 'approve' })
	return { owner, ad, id: owner.facility.id as string, code: owner.facility.facilityCode as string }
}
/** Invites `email` to the facility and returns the raw invite token from the email. */
export async function invite(t: TestApp, adminToken: string, facilityId: string, email: string, role: 'attendant' | 'admin' = 'attendant') {
	t.mail.sent.length = 0
	const res = await post(t, `/api/my-facilities/${facilityId}/attendants`, { email, role }, auth(adminToken))
	return { res, token: res.status === 201 || res.status === 200 ? emailToken(t, email) : '' }
}
