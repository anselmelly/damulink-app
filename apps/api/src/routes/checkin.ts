import { Hono, type Context } from 'hono'
import {
	addResponse,
	bookedVisit,
	clearInvitePhone,
	closeSample,
	donationCount,
	findDonorByCode,
	findResponse,
	findUserById,
	getCall,
	getSample,
	hit,
	insertDonation,
	insertSample,
	insertVisit,
	insertWalkin,
	liveCallsOf,
	moveBookedVisit,
	moveResponse,
	recordDonorFacts,
	pendingSamples,
	recentRequests,
	responseCounts,
	writeAudit,
	type Call,
	type Db,
	type User,
} from '@damu/db'
import {
	CHECKIN_DEFAULTS,
	addMonths,
	checkEligibility,
	formatCallNumber,
	labResultInput,
	normalizeDonorCode,
	normalizePhone,
	outcomeInput,
	walkinInput,
	type CheckinCard,
	type EligibilityCheck,
	type LabSampleItem,
	type OutcomeResult,
} from '@damu/shared-types'
import type { AppEnv } from '../app'
import { desk } from '../lib/desk'
import { getEligibilitySettings } from '../lib/eligibility'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { numberSetting } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { textDonation, textVerified, textWalkinInvite } from '../lib/visit-texts'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** Mounted at /api/my-facilities/:id. Any member of a verified facility may check donors in; everyone else sees "not found". */
export const checkinRoutes = new Hono<AppEnv>()

const notFound = () => new ApiError(404, 'not_found', 'No donor with that code.')
const invalid = (fields: Record<string, string>) => new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', fields)
const ageOn = (dob: string, today: string) => {
	const [y, m, d] = dob.split('-').map(Number)
	const [ty, tm, td] = today.split('-').map(Number)
	return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}
const dayOf = (d: Date) => d.toISOString().slice(0, 10)

/** One 404 for every kind of "no such donor": unknown, regenerated, malformed, under 18, over 65, deleted, suspended. */
async function donorFor(c: Context<AuthEnv>): Promise<User> {
	const { db, clock, user } = c.var
	const limit = await numberSetting(db, 'checkin.lookups_per_10min', CHECKIN_DEFAULTS.lookupsPer10Min)
	if ((await hit(db, `checkin:${user.id}`, 10 * 60_000, clock.now())) > limit) throw new ApiError(429, 'too_many_requests', 'Too many lookups. Wait a few minutes and try again.')
	const u = await findDonorByCode(db, normalizeDonorCode(c.req.param('code') ?? ''))
	if (!u || !u.sex || !u.dateOfBirth) throw notFound()
	const e = checkEligibility({ sex: u.sex, dateOfBirth: u.dateOfBirth, today: dayOf(clock.now()), settings: await getEligibilitySettings(db) })
	if (e.status === 'too_young' || e.status === 'too_old') throw notFound()
	return u
}

function checksFor(u: User, today: string, s: Awaited<ReturnType<typeof getEligibilitySettings>>): EligibilityCheck[] {
	const age = ageOn(u.dateOfBirth!, today)
	const e = checkEligibility({ sex: u.sex!, dateOfBirth: u.dateOfBirth!, today, lastDonationOn: u.lastDonationOn, weightKg: u.weightKg, settings: s })
	const months = u.sex === 'male' ? s.waitingMonthsMale : s.waitingMonthsFemale
	const low = u.weightKg != null && u.weightKg < s.minWeightKg
	return [
		{ key: 'age', ok: e.status !== 'too_young' && e.status !== 'too_old', text: `${age}, within ${s.minAge} to ${s.maxAge}` },
		{ key: 'weight', ok: !low, advisory: true, text: u.weightKg == null ? 'Weigh the donor now and record it' : low ? `${u.weightKg} kg, under ${s.minWeightKg} kg. The facility decides.` : `${u.weightKg} kg, at least ${s.minWeightKg} kg` },
		{ key: 'waiting', ok: e.status !== 'waiting', text: u.lastDonationOn ? `${months} months since ${u.lastDonationOn}` : 'No earlier donation on record' },
	]
}

checkinRoutes.get('/checkin-recent', requireAuth, async (c: Context<AuthEnv>) => {
	const f = await desk(c)
	const rows = await recentRequests(c.var.db, f.id, 20)
	return c.json(rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, at: r.at.toISOString(), scheduledAt: r.scheduledAt?.toISOString() ?? null, name: r.name, code: r.code ?? '' })))
})

checkinRoutes.get('/checkin/:code', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const f = await desk(c)
	const u = await donorFor(c)
	const today = dayOf(clock.now())
	const s = await getEligibilitySettings(db)
	const live = await liveCallsOf(db, f.id)
	const k = await responseCounts(db, live.map((x) => x.id))
	const fits = live.filter((x) => !u.bloodType || x.types.includes(u.bloodType))
	const booked = await bookedVisit(db, u.id, f.id)
	await writeAudit(db, { actorId: user.id, action: 'checkin.lookup', target: u.id, detail: f.id }, clock.now())
	const card: CheckinCard = {
		code: u.donorCode!,
		name: u.name,
		sex: u.sex!,
		age: ageOn(u.dateOfBirth!, today),
		verified: !!u.bloodType,
		bloodType: u.bloodType,
		weightKg: u.weightKg,
		lastDonationOn: u.lastDonationOn,
		donations: await donationCount(db, u.id),
		eligibility: checkEligibility({ sex: u.sex!, dateOfBirth: u.dateOfBirth!, today, lastDonationOn: u.lastDonationOn, weightKg: u.weightKg, settings: s }),
		checks: checksFor(u, today, s),
		calls: fits.map((x) => ({ id: x.id, number: formatCallNumber(x.number), bloodType: x.bloodType, needed: Math.max(0, x.unitsNeeded - k.get(x.id)!.donated) })),
		appointment: booked ? { id: booked.id, kind: booked.kind, scheduledAt: (booked.scheduledAt ?? booked.createdAt).toISOString() } : null,
	}
	return c.json(card)
})

/** Counts a donation toward a call: the donor's YES row becomes donated, or one is made with ring 0. */
async function countTowardCall(db: Db, c: Call, userId: string, donationId: string, now: Date) {
	const row = await findResponse(db, c.id, userId)
	if (row) await moveResponse(db, row.id, ['willing', 'scheduled', 'not_needed'], { status: 'donated', donationId })
	else await addResponse(db, { id: newId(now.getTime()), callId: c.id, userId, ring: 0, status: 'donated', repliedAt: now, donationId })
	const k = (await responseCounts(db, [c.id])).get(c.id)!
	return { number: formatCallNumber(c.number), donated: k.donated, needed: c.unitsNeeded }
}

checkinRoutes.post('/checkin/:code/outcome', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user, sms } = c.var
	const f = await desk(c)
	const u = await donorFor(c)
	const input = parseInput(outcomeInput, await readJson(c))
	const now = clock.now()
	const today = dayOf(now)
	const s = await getEligibilitySettings(db)
	const booked = await bookedVisit(db, u.id, f.id)
	const visit = { id: newId(now.getTime()), userId: u.id, facilityId: f.id, kind: input.outcome === 'test' ? ('test' as const) : input.outcome === 'donated' ? ('donated' as const) : input.outcome, appointmentId: booked?.id ?? null, recordedBy: user.id, createdAt: now }
	const result: OutcomeResult = { outcome: visit.kind }
	let detail: string | undefined

	if (input.outcome === 'donated') {
		const e = checkEligibility({ sex: u.sex!, dateOfBirth: u.dateOfBirth!, today, lastDonationOn: u.lastDonationOn, settings: s })
		if (e.status !== 'eligible') throw new ApiError(409, 'not_eligible', e.eligibleOn ? `Not eligible until ${e.eligibleOn}.` : 'Not eligible to donate.', e.eligibleOn ? { eligibleOn: e.eligibleOn } : undefined)
		let call: Call | undefined
		if (input.callId) {
			call = await getCall(db, input.callId)
			if (!call || call.facilityId !== f.id || call.status !== 'live' || (u.bloodType && !call.types.includes(u.bloodType))) throw invalid({ callId: 'Choose one of the calls listed' })
		}
		const id = newId(now.getTime())
		await insertDonation(db, { id, userId: u.id, facilityId: f.id, donatedOn: today, weightKg: input.weightKg ?? null, bagNumber: input.bagNumber || null, callId: call?.id ?? null, recordedBy: user.id, createdAt: now })
		await insertVisit(db, { ...visit, donationId: id, callId: call?.id ?? null })
		const nextEligibleOn = addMonths(today, u.sex === 'male' ? s.waitingMonthsMale : s.waitingMonthsFemale)
		await recordDonorFacts(db, u.id, { lastDonationOn: today, weightKg: input.weightKg })
		if (!u.bloodType) await insertSample(db, { id: newId(now.getTime()), userId: u.id, facilityId: f.id, source: 'donation', donationId: id, sampleRef: input.bagNumber || `DON-${id.slice(-6)}`, createdAt: now })
		if (call) result.call = await countTowardCall(db, call, u.id, id, now)
		if (input.weightKg != null && input.weightKg < s.minWeightKg) result.warning = 'weight_low'
		result.nextEligibleOn = nextEligibleOn
		if (booked) await moveBookedVisit(db, booked.id, 'completed', now)
		await textDonation(db, sms, u, f.name, nextEligibleOn)
	} else if (input.outcome === 'test') {
		if (u.bloodType && input.bloodType !== 'later' && input.bloodType !== u.bloodType) throw new ApiError(409, 'type_conflict', 'This donor already has a different blood type on record.')
		await insertVisit(db, visit)
		await recordDonorFacts(db, u.id, { weightKg: input.weightKg, bloodType: input.bloodType === 'later' || u.bloodType ? undefined : input.bloodType })
		if (input.bloodType !== 'later') {
			if (!u.bloodType) {
				await textVerified(db, sms, u, input.bloodType)
			}
			result.verified = true
		} else if (!u.bloodType) await insertSample(db, { id: newId(now.getTime()), userId: u.id, facilityId: f.id, source: 'test', sampleRef: `TEST-${visit.id.slice(-6)}`, createdAt: now })
		if (booked) await moveBookedVisit(db, booked.id, 'completed', now)
	} else if (input.outcome === 'deferred') {
		if (input.returnAfter && (input.returnAfter < today || input.returnAfter > addMonths(today, CHECKIN_DEFAULTS.pauseMaxMonths))) throw invalid({ returnAfter: 'Choose a date from today to 12 months ahead' })
		await insertVisit(db, { ...visit, returnAfter: input.returnAfter ?? null })
		if (booked) await moveBookedVisit(db, booked.id, 'cancelled', now)
		if (input.returnAfter) detail = `until ${input.returnAfter}`
	} else {
		await insertVisit(db, visit)
		if (booked) await moveBookedVisit(db, booked.id, 'no_show', now)
	}
	await writeAudit(db, { actorId: user.id, action: 'visit.record', target: u.id, detail: [f.id, visit.kind, detail].filter(Boolean).join(' ') }, now)
	return c.json(result, 201)
})

// ---------- lab results
checkinRoutes.get('/lab-samples', requireAuth, async (c: Context<AuthEnv>) => {
	const f = await desk(c)
	const rows = await pendingSamples(c.var.db, f.id)
	const out: LabSampleItem[] = rows.map(({ s, name, code }) => ({ id: s.id, name, code: code ?? '', source: s.source, on: s.createdAt.toISOString(), sampleRef: s.sampleRef }))
	return c.json(out)
})

checkinRoutes.post('/lab-samples/:sid/result', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user, sms } = c.var
	const f = await desk(c)
	const { bloodType } = parseInput(labResultInput, await readJson(c))
	const sample = await getSample(db, f.id, c.req.param('sid') ?? '')
	if (!sample) throw new ApiError(404, 'not_found', 'Not found.')
	if (sample.status !== 'pending') throw new ApiError(409, 'already_done', 'This result was already entered.')
	const u = await findUserById(db, sample.userId)
	if (!u) throw new ApiError(404, 'not_found', 'Not found.')
	if (u.bloodType && u.bloodType !== bloodType) throw new ApiError(409, 'type_conflict', 'This donor already has a different blood type on record.')
	const now = clock.now()
	if (!(await closeSample(db, sample.id, user.id, now))) throw new ApiError(409, 'already_done', 'This result was already entered.')
	if (!u.bloodType) {
		await recordDonorFacts(db, u.id, { bloodType })
		await textVerified(db, sms, u, bloodType)
	}
	await writeAudit(db, { actorId: user.id, action: 'lab.result', target: u.id, detail: f.id }, now)
	return c.json({ ok: true, name: u.name, bloodType })
})

// ---------- walk-ins
checkinRoutes.post('/walkins', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user, sms, config } = c.var
	const f = await desk(c)
	const input = parseInput(walkinInput, await readJson(c))
	const now = clock.now()
	const today = dayOf(now)
	const s = await getEligibilitySettings(db)
	const phone = input.invitePhone ? normalizePhone(input.invitePhone) : null
	if (input.invitePhone && !phone) throw invalid({ invitePhone: 'Enter a valid phone number' })
	if (input.outcome === 'donated') {
		const e = checkEligibility({ sex: input.sex, dateOfBirth: input.dateOfBirth, today, settings: s })
		if (e.status === 'too_young' || e.status === 'too_old') throw invalid({ dateOfBirth: `Donors must be ${s.minAge} to ${s.maxAge}` })
	}
	const id = newId(now.getTime())
	await insertWalkin(db, { id, facilityId: f.id, name: input.name, sex: input.sex, dateOfBirth: input.dateOfBirth, weightKg: input.weightKg ?? null, bloodType: input.bloodType ?? null, outcome: input.outcome, bagNumber: input.bagNumber || null, invitePhone: phone, recordedBy: user.id, createdAt: now })
	let inviteSent = false
	if (phone) {
		inviteSent = await textWalkinInvite(sms, phone, f.name, `${config.appUrl}/join/${f.slug}`)
		await clearInvitePhone(db, id)
	}
	await writeAudit(db, { actorId: user.id, action: 'walkin.record', target: id, detail: `${f.id} ${input.outcome}` }, now)
	return c.json({ ok: true, inviteSent, ...(input.weightKg != null && input.weightKg < s.minWeightKg ? { warning: 'weight_low' } : {}) }, 201)
})
