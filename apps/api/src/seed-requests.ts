import { and, eq } from 'drizzle-orm'
import { updateUser, addMember, addRequestEvent, bloodRequests, callResponses, calls, insertCall, countSentSince, createUser, facilities, findUserByEmail, insertRequest, loadDotEnv, makeDb, requestEvents } from '@damu/db'
import { formatRequestNumber, newFacilityCode, patientKey } from '@damu/shared-types'
import { newId } from './lib/id'
import { hashPassword } from './lib/password'
import { newShort } from './lib/calls'

// Development data: a requester, a facility team and one request in every status, all invented. Safe to run again.
// Never for the live server: it refuses to run in production.
loadDotEnv()
if (process.env.NODE_ENV === 'production') throw new Error('seed-requests is for development databases only')
const need = (k: string) => {
	const v = process.env[k]
	if (!v) throw new Error(`Missing ${k}`)
	return v
}
const PASSWORD = 'seed-password-1' // a made-up development password, printed below on purpose
const { db, pool } = makeDb({ host: need('DB_HOST'), port: Number(process.env.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') })
const now = new Date()
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000)
const later = (hours: number) => new Date(now.getTime() + hours * 3600_000)

let [facility] = await db.select().from(facilities).where(and(eq(facilities.name, 'Rift County Hospital'), eq(facilities.status, 'verified'))).limit(1)
if (!facility) throw new Error('Rift County Hospital is not in this database: run `pnpm --filter @damu/db seed` first')

if (!facility.facilityCode) {
	// the facility seed does not set one; the facility-code login needs it
	await db.update(facilities).set({ facilityCode: newFacilityCode() }).where(eq(facilities.id, facility.id))
	facility = (await db.select().from(facilities).where(eq(facilities.id, facility.id)))[0]
}

async function person(email: string, name: string, phone: string) {
	const existing = await findUserByEmail(db, email)
	if (existing) return existing
	const id = newId(now.getTime())
	await createUser(db, { id, name, email, phone, passwordHash: await hashPassword(PASSWORD, Number(process.env.PBKDF2_ITERATIONS ?? 310000)), sex: 'female', dateOfBirth: '1990-01-01', smsOptIn: true, createdAt: now, emailVerifiedAt: now, phoneVerifiedAt: now }, [], null)
	return (await findUserByEmail(db, email))!
}
const requester = await person('requester@seed.example', 'Amina Wanjiru', '+254712000001')
const admin = await person('facility-admin@seed.example', 'Grace Njeri', '+254712000002')
const attendant = await person('facility-attendant@seed.example', 'Peter Ouma', '+254712000003')
await addMember(db, { facilityId: facility.id, userId: admin.id, role: 'admin', roleTitle: 'Laboratory in charge', canApprove: true, createdAt: now })
await addMember(db, { facilityId: facility.id, userId: attendant.id, role: 'attendant', roleTitle: 'Laboratory technician', canApprove: false, createdAt: now })

if ((await countSentSince(db, requester.id, new Date(0))) > 0) {
	console.log('requests already seeded')
} else {
	type Row = { ref: string; name: string; type: string; units: number; urgency: 'normal' | 'urgent'; status: (typeof bloodRequests.$inferSelect)['status']; hoursAgo: number; extra?: Partial<typeof bloodRequests.$inferInsert>; events: [typeof requestEvents.$inferInsert['kind'], string | null][] }
	const rows: Row[] = [
		{ ref: 'Ward 2, bed 5', name: 'Joseph Kariuki', type: 'A+', units: 2, urgency: 'urgent', status: 'pending', hoursAgo: 0.3, events: [] },
		{ ref: 'Maternity, bed 3', name: 'Mary Atieno', type: 'O-', units: 1, urgency: 'urgent', status: 'pending', hoursAgo: 1, events: [] },
		{ ref: 'Ward 3, bed 8', name: '', type: 'unsure', units: 2, urgency: 'normal', status: 'pending', hoursAgo: 3, events: [] },
		{ ref: 'Ward 6, bed 1', name: 'Samuel Otieno', type: 'B+', units: 1, urgency: 'normal', status: 'needs_info', hoursAgo: 4, events: [['asked', 'Which doctor referred you?']] },
		{ ref: 'ICU, bed 2', name: 'Peter Ouma', type: 'AB-', units: 1, urgency: 'normal', status: 'confirmed', hoursAgo: 5, extra: { bloodType: 'AB-', units: 1, urgency: 'normal', confirmedBy: attendant.id, confirmedAt: ago(4) }, events: [['confirmed', null]] },
		{ ref: 'Ward 4, bed 12', name: 'Grace Wanjiku', type: 'B+', units: 3, urgency: 'normal', status: 'approved', hoursAgo: 26, extra: { bloodType: 'B+', units: 3, urgency: 'normal', confirmedBy: attendant.id, confirmedAt: ago(25), decidedBy: admin.id, decidedAt: ago(24) }, events: [['confirmed', null], ['approved', null]] },
		{ ref: 'Ward 1, bed 6', name: 'Daniel Mwangi', type: 'O+', units: 3, urgency: 'urgent', status: 'published', hoursAgo: 30, extra: { bloodType: 'O+', units: 3, urgency: 'urgent', confirmedBy: attendant.id, confirmedAt: ago(29), decidedBy: admin.id, decidedAt: ago(28) }, events: [['confirmed', null], ['approved', null]] },
		{ ref: 'Surgical, bed 9', name: 'Lucy Akinyi', type: 'A-', units: 2, urgency: 'normal', status: 'rejected', hoursAgo: 50, extra: { rejectReason: 'no_match', rejectMessage: 'We could not find a patient in that bed.', decidedBy: admin.id, decidedAt: ago(49) }, events: [['rejected', 'We could not find a patient in that bed.']] },
		{ ref: 'Ward 5, bed 2', name: 'John Kamau', type: 'O+', units: 2, urgency: 'normal', status: 'closed', hoursAgo: 120, extra: { bloodType: 'O+', units: 2, urgency: 'normal' }, events: [['confirmed', null], ['approved', null]] },
		{ ref: 'Ward 7, bed 4', name: 'Esther Njoki', type: 'AB+', units: 4, urgency: 'normal', status: 'cancelled', hoursAgo: 200, events: [['cancelled', 'Found blood another way']] },
	]
	for (const r of rows) {
		const id = newId(now.getTime())
		await insertRequest(
			db,
			{ id, facilityId: facility.id, requesterId: requester.id, source: 'public', patientRef: r.ref, patientRefKey: patientKey(r.ref), patientName: r.name || null, relation: 'friend', bloodTypeAsked: r.type, unitsAsked: r.units, neededBy: later(30), urgencyAsked: r.urgency, note: 'Operation planned', status: r.status, createdAt: ago(r.hoursAgo), updatedAt: ago(r.hoursAgo), ...r.extra },
			{ id: newId(now.getTime()), requestId: id, kind: 'sent', actorId: requester.id, note: null, visibleToRequester: true, createdAt: ago(r.hoursAgo) },
		)
		for (const [kind, note] of r.events) await addRequestEvent(db, { id: newId(now.getTime()), requestId: id, kind, actorId: kind === 'cancelled' ? requester.id : attendant.id, note, visibleToRequester: true, createdAt: ago(r.hoursAgo - 0.1) })
	}
	// one the facility raised itself
	const id = newId(now.getTime())
	await insertRequest(db, { id, facilityId: facility.id, raisedBy: admin.id, source: 'facility', patientRef: 'Ward 8, bed 3', patientRefKey: patientKey('Ward 8, bed 3'), bloodTypeAsked: 'A-', unitsAsked: 2, neededBy: later(20), urgencyAsked: 'normal', status: 'approved', bloodType: 'A-', units: 2, urgency: 'normal', confirmedBy: admin.id, confirmedAt: ago(2), decidedBy: admin.id, decidedAt: ago(2), createdAt: ago(2), updatedAt: ago(2) }, { id: newId(now.getTime()), requestId: id, kind: 'raised', actorId: admin.id, note: null, visibleToRequester: false, createdAt: ago(2) })
	const [last] = await db.select({ n: bloodRequests.number }).from(bloodRequests).where(eq(bloodRequests.id, id))
	console.log(`seeded ${rows.length + 1} requests, the last is ${formatRequestNumber(last.n)}`)
}

// calls: one live (with donors who said yes) and one closed, on the seeded published and closed requests
const [hasCalls] = await db.select({ id: calls.id }).from(calls).where(eq(calls.facilityId, facility.id)).limit(1)
if (hasCalls) {
	console.log('calls already seeded')
} else {
	const reqOf = async (ref: string) => (await db.select().from(bloodRequests).where(and(eq(bloodRequests.facilityId, facility.id), eq(bloodRequests.patientRef, ref))).limit(1))[0]
	const donors = [
		await person('donor1@seed.example', 'Brian Otieno', '+254712000011'),
		await person('donor2@seed.example', 'Faith Chebet', '+254712000012'),
		await person('donor3@seed.example', 'Hassan Ali', '+254712000013'),
	]
	// alert-ready: a recorded blood type, this facility as home, SMS on, so a call with SMS reaches them
	for (const d of donors) await updateUser(db, d.id, { bloodType: 'O+', weightKg: 70, homeFacilityId: facility.id, smsOptIn: true })
	const pub = await reqOf('Ward 1, bed 6')
	const done = await reqOf('Ward 5, bed 2')
	if (pub && done) {
		const mk = async (r: typeof pub, o: Partial<typeof calls.$inferInsert>) => {
			const id = newId(now.getTime())
			await insertCall(db, { id, requestId: r.id, facilityId: facility.id, bloodType: r.bloodType!, types: ['O+', 'O-'], urgency: r.urgency!, publicText: `We are appealing for ${r.bloodType} blood. Please share this call.`, isPublic: true, smsEnabled: false, status: 'live', unitsNeeded: r.units!, publishedAt: ago(20), closesAt: later(52), createdBy: admin.id, ...o }, newShort)
			await addRequestEvent(db, { id: newId(now.getTime()), requestId: r.id, kind: 'published', actorId: admin.id, note: null, visibleToRequester: true, createdAt: o.publishedAt ?? ago(20) })
			return id
		}
		const live = await mk(pub, {})
		const statuses = ['willing', 'scheduled', 'donated'] as const
		for (const [i, d] of donors.entries()) await db.insert(callResponses).values({ id: newId(now.getTime()), callId: live, userId: d.id, ring: i === 2 ? 2 : 1, status: statuses[i], repliedAt: ago(3 - i), scheduledAt: i === 1 ? later(20) : null })
		await mk(done, { status: 'closed', closedAt: ago(100), closeReason: 'covered', publishedAt: ago(118), closesAt: ago(46) })
		console.log('seeded 2 calls (one live with 3 donors, one closed)')
	}
}
console.log(`\nrequester:          requester@seed.example            (${requester.name})\nfacility admin:     facility-admin@seed.example       (${admin.name}, can approve)\nfacility attendant: facility-attendant@seed.example   (${attendant.name}, cannot approve)\npassword for all:   ${PASSWORD}\nfacility:           ${facility.name}, facility code ${facility.facilityCode ?? '(none: set one if you want to use the code login)'}`)
await pool.end()
