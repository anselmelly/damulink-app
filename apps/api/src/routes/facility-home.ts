import { Hono, type Context } from 'hono'
import { donorRequestCounts, getMembership, hit, homeDonorCounts, homeDonors, liveCallsOf, pendingSampleCount, responseCounts, visitsBetween, waitingRequests, writeAudit } from '@damu/db'
import { CORRECTION_DEFAULTS, checkEligibility, formatCallNumber, formatRequestNumber, type DonorListItem, type DonorsList, type FacilityHome } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { desk } from '../lib/desk'
import { getEligibilitySettings } from '../lib/eligibility'
import { ApiError } from '../lib/errors'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** Mounted at /api/my-facilities/:id. The donors list is for admins; the home screen is for the whole team. */
export const facilityHomeRoutes = new Hono<AppEnv>()

const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

facilityHomeRoutes.get('/donors', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const f = await desk(c)
	if ((await getMembership(db, f.id, user.id))?.role !== 'admin') throw new ApiError(403, 'admins_only', 'Only facility admins can see the donor list.')
	const now = clock.now()
	if ((await hit(db, `donors:${user.id}`, 10 * 60_000, now)) > CORRECTION_DEFAULTS.lookupsPer10Min) throw new ApiError(429, 'too_many_requests', 'Too many views. Wait a few minutes.')
	const q = (c.req.query('q') ?? '').trim().slice(0, 60)
	const status = c.req.query('status') === 'verified' ? 'verified' : c.req.query('status') === 'registered' ? 'registered' : undefined
	const bloodType = c.req.query('bloodType') || undefined
	const page = Math.max(1, Number(c.req.query('page')) || 1)
	const size = CORRECTION_DEFAULTS.donorsPageSize
	const s = await getEligibilitySettings(db)
	const today = now.toISOString().slice(0, 10)
	const { items, total } = await homeDonors(db, f.id, { q: q || undefined, status, bloodType, limit: size, offset: (page - 1) * size })
	const list: DonorListItem[] = items.map(({ u, p }) => {
		const e = u.sex && u.dateOfBirth ? checkEligibility({ sex: u.sex, dateOfBirth: u.dateOfBirth, today, lastDonationOn: u.lastDonationOn, settings: s }) : null
		const eligibility = !u.bloodType && !u.lastDonationOn ? 'First visit' : e?.status === 'eligible' ? 'Eligible now' : e?.status === 'waiting' && e.eligibleOn ? `Eligible ${longDay(e.eligibleOn)}` : 'Not eligible'
		return { name: u.name, code: u.donorCode!, bloodType: u.bloodType, verified: !!u.bloodType, lastDonationOn: u.lastDonationOn, eligibility, alertsOn: p ? p.smsAlerts : u.smsOptIn, suspended: u.status === 'suspended' }
	})
	await writeAudit(db, { actorId: user.id, action: 'donors.view', target: f.id, detail: JSON.stringify({ q: !!q, status, bloodType, page }) }, now)
	const body: DonorsList = { items: list, total, page, pageSize: size, counts: await homeDonorCounts(db, f.id) }
	return c.json(body)
})

facilityHomeRoutes.get('/home', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock } = c.var
	const f = await desk(c)
	const now = clock.now()
	const day = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
	const from = new Date(`${day}T00:00:00+03:00`)
	const to = new Date(from.getTime() + 86_400_000)
	const [waiting, live, visits, lab, follow] = [await waitingRequests(db, f.id, 3), await liveCallsOf(db, f.id), await visitsBetween(db, f.id, from, to), await pendingSampleCount(db, f.id), await donorRequestCounts(db, f.id)]
	const k = await responseCounts(db, live.map((x) => x.id))
	const body: FacilityHome = {
		counts: { toReview: waiting.total, activeCalls: live.length, followUp: follow.follow_up, visitsToday: visits.length, labWaiting: lab },
		waiting: waiting.rows.map((r) => ({ id: r.id, number: formatRequestNumber(r.number), bloodType: r.bloodType ?? r.bloodTypeAsked, units: r.units ?? r.unitsAsked, urgency: r.urgency ?? r.urgencyAsked, ref: r.patientRef, at: r.createdAt.toISOString() })),
		calls: live.map((x) => ({ id: x.id, number: formatCallNumber(x.number), bloodType: x.bloodType, yes: k.get(x.id)!.yes, donated: k.get(x.id)!.donated, scheduled: k.get(x.id)!.scheduled, needed: x.unitsNeeded })),
		visits: visits.map(({ r, name }) => ({ id: r.id, at: r.scheduledAt!.toISOString(), name, kind: r.kind, checkedIn: r.status === 'completed' })),
	}
	return c.json(body)
})
