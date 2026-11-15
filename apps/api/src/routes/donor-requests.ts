import { Hono, type Context } from 'hono'
import { bookedBetween, donorRequestCounts, donorRequestsFor, getFacilityRequest, moveFacilityRequest, writeAudit, type User } from '@damu/db'
import {
	DONOR_REQUEST_DEFAULTS,
	REQUEST_TABS,
	checkEligibility,
	declineInput,
	scheduleVisitInput,
	type DonorRequestItem,
	type DonorRequestList,
	type RequestTab,
} from '@damu/shared-types'
import type { AppEnv } from '../app'
import { desk } from '../lib/desk'
import { getEligibilitySettings } from '../lib/eligibility'
import { ApiError } from '../lib/errors'
import { numberSetting } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { textBooked, textVisitCancelled } from '../lib/visit-texts'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** Mounted at /api/my-facilities/:id/donor-requests. Any member of a verified facility; everyone else sees "not found". */
export const donorRequestRoutes = new Hono<AppEnv>()

const nairobiDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

donorRequestRoutes.get('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock } = c.var
	const f = await desk(c)
	const tab = (c.req.query('tab') ?? 'follow_up') as RequestTab
	if (!REQUEST_TABS.includes(tab)) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { tab: 'Choose follow_up, scheduled or past' })
	const s = await getEligibilitySettings(db)
	const today = nairobiDay(clock.now())
	const items: DonorRequestItem[] = (await donorRequestsFor(db, f.id, tab)).map(({ r, u }) => {
		let note: string | null = null
		if (r.kind === 'donate' && u.sex && u.dateOfBirth) {
			const e = checkEligibility({ sex: u.sex, dateOfBirth: u.dateOfBirth, today, lastDonationOn: u.lastDonationOn, settings: s })
			note = e.status === 'eligible' ? 'Likely eligible' : e.status === 'waiting' && e.eligibleOn ? `Waiting period until ${longDay(e.eligibleOn)}` : 'Not eligible to donate'
		}
		return {
			id: r.id,
			kind: r.kind,
			status: r.status,
			name: u.name,
			code: u.donorCode ?? '',
			verified: !!u.bloodType,
			days: r.days.split(','),
			timeOfDay: r.timeOfDay,
			askedAt: r.createdAt.toISOString(),
			scheduledAt: r.scheduledAt?.toISOString() ?? null,
			rescheduleAsked: r.rescheduleAsked,
			cancelledBy: r.cancelledBy,
			cancelReason: r.cancelReason,
			note,
		}
	})
	const body: DonorRequestList = { tab, items, counts: await donorRequestCounts(db, f.id) }
	return c.json(body)
})

async function load(c: Context<AuthEnv>, facilityId: string) {
	const row = await getFacilityRequest(c.var.db, facilityId, c.req.param('aid') ?? '')
	if (!row) throw new ApiError(404, 'not_found', 'Not found.')
	return row as { r: NonNullable<typeof row>['r']; u: User }
}

/** Sets a date for a request, or moves a booked visit. */
donorRequestRoutes.post('/:aid/schedule', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user, sms } = c.var
	const f = await desk(c)
	const { scheduledAt } = parseInput(scheduleVisitInput, await readJson(c))
	const { r, u } = await load(c, f.id)
	if (r.status !== 'requested' && r.status !== 'scheduled') throw new ApiError(409, 'invalid_move', 'This request is already finished.')
	const now = clock.now()
	const when = new Date(scheduledAt)
	const max = await numberSetting(db, 'appointments.max_days_ahead', DONOR_REQUEST_DEFAULTS.maxDaysAhead)
	if (when.getTime() <= now.getTime()) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { scheduledAt: 'Choose a time in the future' })
	if (when.getTime() > now.getTime() + max * 86_400_000) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { scheduledAt: `Choose a date within ${max} days` })
	if (r.kind === 'donate' && u.sex && u.dateOfBirth) {
		const e = checkEligibility({ sex: u.sex, dateOfBirth: u.dateOfBirth, today: nairobiDay(when), lastDonationOn: u.lastDonationOn, settings: await getEligibilitySettings(db) })
		if (e.status === 'waiting' && e.eligibleOn) throw new ApiError(422, 'not_eligible', `The donor can donate from ${longDay(e.eligibleOn)}.`, { scheduledAt: `The donor can donate from ${longDay(e.eligibleOn)}`, eligibleOn: e.eligibleOn })
	}
	const moved = r.status === 'scheduled'
	if (!(await moveFacilityRequest(db, r.id, ['requested', 'scheduled'], { status: 'scheduled', scheduledAt: when, rescheduleAsked: false, updatedAt: now }))) throw new ApiError(409, 'invalid_move', 'This request is already finished.')
	const hour = new Date(Math.floor(when.getTime() / 3600_000) * 3600_000)
	const busy = (await bookedBetween(db, f.id, hour, new Date(hour.getTime() + 3600_000), r.id)) >= (await numberSetting(db, 'appointments.busy_hour', DONOR_REQUEST_DEFAULTS.busyHour))
	await writeAudit(db, { actorId: user.id, action: moved ? 'donor_request.reschedule' : 'donor_request.schedule', target: r.id, detail: f.id }, now)
	await textBooked(db, sms, u, { facility: f.name, when, code: u.donorCode ?? '', kind: r.kind, moved })
	return c.json({ ok: true, ...(busy ? { warning: 'busy' } : {}) })
})

async function turnDown(c: Context<AuthEnv>, from: 'requested' | 'scheduled') {
	const { db, clock, user, sms } = c.var
	const f = await desk(c)
	const input = parseInput(declineInput, await readJson(c))
	const { r, u } = await load(c, f.id)
	const now = clock.now()
	if (r.status !== from || !(await moveFacilityRequest(db, r.id, [from], { status: 'cancelled', cancelledBy: 'facility', cancelReason: input.reason, cancelNote: input.reason === 'other' ? input.note ?? null : null, rescheduleAsked: false, updatedAt: now }))) {
		throw new ApiError(409, 'invalid_move', from === 'requested' ? 'Only a request waiting for a date can be declined.' : 'Only a booked visit can be cancelled.')
	}
	await writeAudit(db, { actorId: user.id, action: from === 'requested' ? 'donor_request.decline' : 'donor_request.cancel', target: r.id, detail: `${f.id} ${input.reason}` }, now)
	await textVisitCancelled(db, sms, u, f.name, input.reason)
	return c.json({ ok: true })
}
donorRequestRoutes.post('/:aid/decline', requireAuth, (c: Context<AuthEnv>) => turnDown(c, 'requested'))
donorRequestRoutes.post('/:aid/cancel', requireAuth, (c: Context<AuthEnv>) => turnDown(c, 'scheduled'))
