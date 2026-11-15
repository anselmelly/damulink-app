import { eq } from 'drizzle-orm'
import { addInterest, addMember, addRequestEvent, bloodRequests, callResponses, calls as callsTable, createUser, donorCodeExists, facilities, findUserByEmail, insertCall, insertDrive, insertRequest, type Db } from '@damu/db'
import { newDonorCode, patientKey } from '@damu/shared-types'
import { newShort } from './calls'
import { uniqueFacilityCode, uniqueSlug } from './facilities'
import { newId } from './id'
import { hashPassword } from './password'

/**
 * Demo data for a shared demo server: invented facilities, a team at each, donors, and a request, a call and a drive at one facility.
 * Everything is "insert if missing": it never updates a row, never touches a facility that already exists (even by name), and every
 * account uses @demo.example, so the demo people are easy to tell from real ones.
 */
type Seed = { name: string; type: string; town: string; county: string; status?: 'verified' | 'rejected' }
const FACILITIES: Seed[] = [
	{ name: 'Eastlands Hospital', type: 'hospital', town: 'Nairobi', county: 'Nairobi' },
	{ name: 'Capital Blood Bank', type: 'blood bank', town: 'Nairobi', county: 'Nairobi' },
	{ name: 'Rift County Hospital', type: 'hospital', town: 'Nakuru', county: 'Nakuru' },
	{ name: 'Lakeside Health Centre', type: 'health centre', town: 'Naivasha', county: 'Nakuru' },
	{ name: 'Lakeview Hospital', type: 'hospital', town: 'Kisumu', county: 'Kisumu' },
	{ name: 'Coast Medical Centre', type: 'hospital', town: 'Mombasa', county: 'Mombasa' },
	{ name: 'Highlands Mission Hospital', type: 'hospital', town: 'Eldoret', county: 'Uasin Gishu' },
	{ name: 'Mount Valley Health Centre', type: 'health centre', town: 'Nyeri', county: 'Nyeri' },
	{ name: 'Riverside Health Centre', type: 'health centre', town: 'Thika', county: 'Kiambu' },
	{ name: 'Sunrise Clinic', type: 'health centre', town: 'Kisii', county: 'Kisii', status: 'rejected' },
]
const FIRST = ['Grace', 'Peter', 'Amina', 'Brian', 'Faith', 'Hassan', 'Mercy', 'Daniel', 'Esther', 'Kevin', 'Lucy', 'Samuel', 'Naomi', 'Joseph', 'Ruth', 'Collins', 'Joy', 'Victor', 'Mary', 'Ibrahim']
const LAST = ['Njeri', 'Ouma', 'Wanjiru', 'Otieno', 'Chebet', 'Ali', 'Atieno', 'Mwangi', 'Wairimu', 'Mutua', 'Akinyi', 'Kamau', 'Achieng', 'Kariuki', 'Mutheu', 'Kiprop', 'Wambui', 'Odhiambo', 'Nyambura', 'Salim']
const TYPES = ['O+', 'A+', 'B+', 'O-', 'A-', 'AB+', 'B-', 'O+', 'A+', 'O+', 'B+', 'AB-', 'O-', 'A+']
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** A fixed id per facility, so running again finds the same rows. */
const idFor = (name: string) => ('01DEMO' + name.toUpperCase().replace(/[^A-Z0-9]/g, '')).padEnd(26, '0').slice(0, 26)
const DAY = 86_400_000

export type DemoSummary = { facilities: number; createdAccounts: number; donors: number; skipped: string[]; accounts: { facility: string; code: string | null; role: string; email: string }[] }

export async function seedDemo(db: Db, o: { password: string; iterations: number; now: Date }): Promise<DemoSummary> {
	const { now } = o
	const ago = (h: number) => new Date(now.getTime() - h * 3600_000)
	const later = (h: number) => new Date(now.getTime() + h * 3600_000)
	const hash = await hashPassword(o.password, o.iterations)
	let n = 0 // phone counter: +254700 followed by six digits, all invented
	const phone = () => `+254700${String(100001 + n++)}`
	const summary: DemoSummary = { facilities: 0, createdAccounts: 0, donors: 0, skipped: [], accounts: [] }

	async function person(email: string, name: string, extra: Partial<Parameters<typeof createUser>[1]> = {}) {
		const have = await findUserByEmail(db, email)
		if (have) return have
		const id = newId(now.getTime())
		await createUser(db, { id, name, email, phone: phone(), passwordHash: hash, createdAt: now, emailVerifiedAt: now, phoneVerifiedAt: now, ...extra }, [], null)
		summary.createdAccounts++
		return (await findUserByEmail(db, email))!
	}

	// ---- facilities and their teams
	const made: { id: string; name: string; code: string | null }[] = []
	for (const [i, s] of FACILITIES.entries()) {
		const id = idFor(s.name)
		const [byId] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, id)).limit(1)
		const [byName] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.name, s.name)).limit(1)
		if (!byId && byName) {
			summary.skipped.push(s.name) // a real facility has this name: leave it completely alone
			continue
		}
		const status = s.status ?? 'verified'
		const fresh = !byId
		if (fresh) {
			await db.insert(facilities).values({ id, name: s.name, type: s.type, town: s.town, county: s.county, status, ...(status === 'verified' ? { facilityCode: await uniqueFacilityCode(db), slug: await uniqueSlug(db, s.name, s.town), verifiedAt: now } : {}) })
		}
		summary.facilities++
		const [f] = await db.select().from(facilities).where(eq(facilities.id, id))
		made.push({ id, name: s.name, code: f.facilityCode })
		if (status !== 'verified' || !fresh) continue // an existing demo facility keeps its team as it is
		const key = kebab(s.name)
		for (const [role, k] of [['admin', 0], ['attendant', 1]] as const) {
			const name = `${FIRST[(i * 2 + k) % FIRST.length]} ${LAST[(i * 3 + k * 5) % LAST.length]}`
			const email = `${role}.${key}@demo.example`
			const u = await person(email, name, { sex: k ? 'male' : 'female', dateOfBirth: '1988-04-12', smsOptIn: true })
			await addMember(db, { facilityId: id, userId: u.id, role, roleTitle: role === 'admin' ? 'Laboratory in charge' : 'Laboratory technician', canApprove: role === 'admin', createdAt: now })
			summary.accounts.push({ facility: s.name, code: f.facilityCode, role, email })
		}
	}

	// ---- donors: verified phone, a recorded blood type, alerts on, spread over the verified facilities
	const homes = made.filter((m) => m.code)
	for (const [i, t] of TYPES.entries()) {
		const email = `donor${i + 1}@demo.example`
		if (await findUserByEmail(db, email)) continue
		let code: string
		do code = newDonorCode()
		while (await donorCodeExists(db, code))
		const home = homes[i % homes.length]
		await person(email, `${FIRST[(i + 4) % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`, { sex: i % 2 ? 'male' : 'female', dateOfBirth: `${1978 + (i % 20)}-0${(i % 9) + 1}-15`, donorCode: code, homeFacilityId: home.id, smsOptIn: true, bloodType: t as any, bloodTypeFacilityId: home.id, bloodTypeAt: ago(24 * 30), weightKg: 60 + (i % 5) * 4 })
		summary.donors++
	}

	// ---- one facility with something going on: Rift County Hospital (only when this seeder made it)
	const rift = made.find((m) => m.name === 'Rift County Hospital' && m.id === idFor('Rift County Hospital'))
	const admin = rift ? await findUserByEmail(db, 'admin.rift-county-hospital@demo.example') : undefined
	const attendant = rift ? await findUserByEmail(db, 'attendant.rift-county-hospital@demo.example') : undefined
	const requester = await findUserByEmail(db, 'donor1@demo.example')
	if (rift && admin && attendant && requester) {
		const [asked] = await db.select({ id: callResponses.id }).from(callResponses).limit(1) // calls are made once: skip if any exist
		const has = await db.select({ id: bloodRequests.id }).from(bloodRequests).where(eq(bloodRequests.facilityId, rift.id)).limit(1)
		if (!has.length && !asked) await riftActivity(db, { rift: rift.id, admin: admin.id, attendant: attendant.id, requester: requester.id, now, ago, later })
	}
	return summary
}

async function riftActivity(db: Db, c: { rift: string; admin: string; attendant: string; requester: string; now: Date; ago: (h: number) => Date; later: (h: number) => Date }) {
	const { now, ago, later } = c
	type Row = { ref: string; name: string; type: string; units: number; urgency: 'normal' | 'urgent'; status: (typeof bloodRequests.$inferSelect)['status']; hours: number; extra?: Partial<typeof bloodRequests.$inferInsert> }
	const conf = { confirmedBy: c.attendant, confirmedAt: ago(4) }
	const rows: Row[] = [
		{ ref: 'Ward 2, bed 5', name: 'Joseph Kariuki', type: 'A+', units: 2, urgency: 'urgent', status: 'pending', hours: 0.3 },
		{ ref: 'Maternity, bed 3', name: 'Mary Atieno', type: 'O-', units: 1, urgency: 'urgent', status: 'pending', hours: 1 },
		{ ref: 'Ward 6, bed 1', name: 'Samuel Otieno', type: 'B+', units: 1, urgency: 'normal', status: 'needs_info', hours: 4 },
		{ ref: 'ICU, bed 2', name: 'Peter Ouma', type: 'AB-', units: 1, urgency: 'normal', status: 'confirmed', hours: 5, extra: { bloodType: 'AB-', units: 1, urgency: 'normal', ...conf } },
		{ ref: 'Ward 1, bed 6', name: 'Daniel Mwangi', type: 'O+', units: 3, urgency: 'urgent', status: 'published', hours: 30, extra: { bloodType: 'O+', units: 3, urgency: 'urgent', ...conf, decidedBy: c.admin, decidedAt: ago(28) } },
		{ ref: 'Ward 5, bed 2', name: 'John Kamau', type: 'O+', units: 2, urgency: 'normal', status: 'closed', hours: 120, extra: { bloodType: 'O+', units: 2, urgency: 'normal', ...conf, decidedBy: c.admin, decidedAt: ago(118) } },
	]
	const ids: Record<string, string> = {}
	for (const r of rows) {
		const id = (ids[r.ref] = newId(now.getTime()))
		await insertRequest(db, { id, facilityId: c.rift, requesterId: c.requester, source: 'public', patientRef: r.ref, patientRefKey: patientKey(r.ref), patientName: r.name, relation: 'friend', bloodTypeAsked: r.type, unitsAsked: r.units, neededBy: later(30), urgencyAsked: r.urgency, note: 'Operation planned', status: r.status, createdAt: ago(r.hours), updatedAt: ago(r.hours), ...r.extra }, { id: newId(now.getTime()), requestId: id, kind: 'sent', actorId: c.requester, note: null, visibleToRequester: true, createdAt: ago(r.hours) })
	}
	const mk = async (ref: string, o: Partial<typeof callsTable.$inferInsert>) => {
		const id = newId(now.getTime())
		await insertCall(db, { id, requestId: ids[ref], facilityId: c.rift, bloodType: 'O+', types: ['O+', 'O-'], urgency: 'normal', publicText: 'We are appealing for O+ blood. Please share this call.', isPublic: true, smsEnabled: false, status: 'live', unitsNeeded: 3, publishedAt: ago(20), closesAt: later(52), createdBy: c.admin, ...o }, newShort)
		await addRequestEvent(db, { id: newId(now.getTime()), requestId: ids[ref], kind: 'published', actorId: c.admin, note: null, visibleToRequester: true, createdAt: o.publishedAt ?? ago(20) })
		return id
	}
	const live = await mk('Ward 1, bed 6', { urgency: 'urgent' })
	await mk('Ward 5, bed 2', { status: 'closed', closedAt: ago(100), closeReason: 'covered', publishedAt: ago(118), closesAt: ago(46), unitsNeeded: 2 })
	const statuses = ['willing', 'scheduled', 'donated'] as const
	for (const [i, email] of ['donor2@demo.example', 'donor3@demo.example', 'donor4@demo.example'].entries()) {
		const u = await findUserByEmail(db, email)
		if (u) await db.insert(callResponses).values({ id: newId(now.getTime()), callId: live, userId: u.id, ring: 1, status: statuses[i], repliedAt: ago(3 - i), scheduledAt: i === 1 ? later(20) : null })
	}

	// drives: one published for the coming Saturday (with a few interested) and one draft
	const nairobi = new Date(now.getTime() + 3 * 3600_000)
	const toSat = ((6 - nairobi.getUTCDay() + 7) % 7) || 7
	const sat = new Date(nairobi.getTime() + toSat * DAY).toISOString().slice(0, 10)
	const sun = new Date(nairobi.getTime() + (toSat + 1) * DAY).toISOString().slice(0, 10)
	const base = { facilityId: c.rift, town: 'Nakuru', target: 40, contactName: 'Mrs. Njeri Kamau', contactPhone: '+254700100999', createdBy: c.admin, createdAt: now, updatedAt: now }
	const pubDrive = newId(now.getTime())
	await insertDrive(db, { ...base, id: pubDrive, host: 'Greenfield Secondary School', venue: 'School hall', date: sat, starts: '09:00', ends: '15:00', publicText: 'Hosted by Greenfield Secondary School together with Rift County Hospital. Come and give blood. Everyone is welcome.', status: 'published', isPublic: true, smsEnabled: false, publishedAt: now }, newShort)
	for (const name of ['Brian Otieno', 'Faith Chebet', 'Peter Mwangi']) await addInterest(db, { id: newId(now.getTime()), driveId: pubDrive, name, phone: null, createdAt: ago(2) })
	await insertDrive(db, { ...base, id: newId(now.getTime()), host: 'Nakuru Town Church', venue: 'Church grounds', date: sun, starts: '10:00', ends: '14:00', publicText: 'A community blood drive at the church grounds. Bring water and a friend.', status: 'draft' }, newShort)
}
