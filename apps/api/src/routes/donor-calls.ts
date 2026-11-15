import { Hono, type Context } from 'hono'
import { addResponse, answeredCalls, donorPlaces, findResponse, getPublicCall, liveCallsAccepting, responseCounts } from '@damu/db'
import { RING_DEFAULTS, checkEligibility, formatCallNumber, parseCallNumber, ringOf, type DonorCall, type DonorCalls } from '@damu/shared-types'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import { unitsOf } from '../lib/calls'
import { getEligibilitySettings } from '../lib/eligibility'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { numberSetting } from '../lib/requests'

/** A signed-in donor's own view of open calls. No patient data, ever. */
export const donorCallRoutes = new Hono<AuthEnv>()
donorCallRoutes.use('*', requireAuth)

const WHERE = { 1: 'Your facility', 2: 'Nearby', 3: 'In your area' } as const

/** Who the caller is as a donor: 403 when too young or old, `verified` false until a facility has recorded a blood type. */
async function donorOf(c: Context<AuthEnv>) {
	const { db, user, clock } = c.var
	const settings = await getEligibilitySettings(db)
	const today = clock.now().toISOString().slice(0, 10)
	if (!user.sex || !user.dateOfBirth) throw new ApiError(403, 'not_a_donor', 'Calls are for donors aged 18 to 65.')
	const e = checkEligibility({ sex: user.sex, dateOfBirth: user.dateOfBirth, today, lastDonationOn: user.lastDonationOn, weightKg: user.weightKg, settings })
	if (e.status === 'too_young' || e.status === 'too_old') throw new ApiError(403, 'not_a_donor', 'Calls are for donors aged 18 to 65.')
	return { e, verified: !!user.bloodType && !!user.phoneVerifiedAt }
}

/** Live calls that fit this donor's blood type and places, each with the closest ring. */
async function fitting(c: Context<AuthEnv>) {
	const { db, user } = c.var
	const km = { ring2Km: await numberSetting(db, 'rings.ring2_km', RING_DEFAULTS.ring2Km), ring3Km: await numberSetting(db, 'rings.ring3_km', RING_DEFAULTS.ring3Km) }
	const places = (await donorPlaces(db, [user.id])).get(user.id) ?? []
	const out = []
	for (const r of await liveCallsAccepting(db, user.bloodType!)) {
		const rings = places.map((p) => ringOf({ id: r.c.facilityId, lat: r.lat, lng: r.lng, county: r.county }, p, km)).filter((x): x is 1 | 2 | 3 => x !== null)
		if (rings.length) out.push({ ...r, ring: Math.min(...rings) as 1 | 2 | 3 })
	}
	return out
}

donorCallRoutes.get('/', async (c) => {
	const { db, user } = c.var
	const { e, verified } = await donorOf(c)
	if (!verified) return c.json({ state: 'unverified', items: [] } satisfies DonorCalls)
	const rows = await fitting(c)
	const ids = rows.map((r) => r.c.id)
	const [counts, answered] = [await responseCounts(db, ids), await answeredCalls(db, user.id, ids)]
	const items: DonorCall[] = []
	for (const r of rows) {
		const stillNeeded = unitsOf(r.c.unitsNeeded, counts.get(r.c.id)!).stillNeeded
		const accepted = answered.has(r.c.id)
		if (!stillNeeded && !accepted) continue
		items.push({ code: formatCallNumber(r.c.number), short: r.c.short, bloodType: r.c.bloodType, facility: r.facilityName, town: r.town, urgency: r.c.urgency, postedAt: r.c.publishedAt.toISOString(), stillNeeded, where: WHERE[r.ring], accepted })
	}
	const body: DonorCalls = e.status === 'waiting' ? { state: 'waiting', nextEligibleOn: e.eligibleOn, items } : { state: 'ok', items }
	return c.json(body)
})

donorCallRoutes.post('/:code/accept', async (c) => {
	const { db, user, clock } = c.var
	const { e, verified } = await donorOf(c)
	if (!verified) throw new ApiError(403, 'not_verified', 'Calls open once a facility has confirmed your blood type.')
	const key = c.req.param('code').slice(0, 20)
	const n = parseCallNumber(key)
	const hit = await getPublicCall(db, n != null ? { number: n } : { short: key.toLowerCase() })
	const fit = hit ? (await fitting(c)).find((r) => r.c.id === hit.c.id) : undefined
	if (!hit) throw new ApiError(404, 'not_found', 'Not found.')
	if (hit.c.status !== 'live') throw new ApiError(409, 'closed', 'This call has closed.')
	if (!fit) throw new ApiError(404, 'not_found', 'Not found.')
	if (await findResponse(db, hit.c.id, user.id)) return c.json({ status: 'accepted' })
	if (e.status === 'waiting') throw new ApiError(409, 'not_eligible', 'You can donate again later.', { eligibleOn: e.eligibleOn ?? '' })
	if (!unitsOf(hit.c.unitsNeeded, (await responseCounts(db, [hit.c.id])).get(hit.c.id)!).stillNeeded) throw new ApiError(409, 'covered', 'This call has enough donors for now.')
	await addResponse(db, { id: newId(clock.now().getTime()), callId: hit.c.id, userId: user.id, ring: fit.ring, status: 'willing', repliedAt: clock.now() })
	return c.json({ status: 'accepted' })
})
