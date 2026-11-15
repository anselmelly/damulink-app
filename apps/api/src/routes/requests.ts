import { Hono, type Context } from 'hono'
import { getCallForRequest, addRequestEvent, facilityExists, findOpenForPatient, getFacility, getRequest, countSentSince, insertRequest, listForRequester, moveRequest, writeAudit } from '@damu/db'
import { REQUEST_DEFAULTS, REQUEST_MOVES, formatRequestNumber, cancelInput, patientKey, replyInput, requestInput } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { endCall } from '../lib/calls'
import { checkNeededBy, detailView, nairobiDayStart, numberSetting, summaryView } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** A person's own requests for blood. Facilities see requests through /api/my-facilities/:id/requests. */
export const requestRoutes = new Hono<AppEnv>()

/** The request, if it is mine; anyone else (even a facility admin, from this door) gets "not found". */
async function mine(c: Context<AuthEnv>) {
	const r = await getRequest(c.var.db, c.req.param('id') ?? '')
	if (!r || r.requesterId !== c.var.user.id) throw new ApiError(404, 'not_found', 'Not found.')
	return r
}
async function view(c: Context<AuthEnv>, id: string) {
	const r = (await getRequest(c.var.db, id))!
	const f = (await getFacility(c.var.db, r.facilityId))!
	return { ...(await detailView(c.var.db, r, true)), facility: { id: f.id, name: f.name, town: f.town } }
}

requestRoutes.post('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const input = parseInput(requestInput, await readJson(c))
	if (!user.phoneVerifiedAt) throw new ApiError(403, 'phone_unverified', 'Verify your phone number before asking for blood.')
	const now = clock.now()
	const neededBy = await checkNeededBy(db, input.neededBy, now)
	if (!(await facilityExists(db, input.facilityId))) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { facilityId: 'Choose a verified facility from the list' })
	const key = patientKey(input.patientRef)
	if (!key) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { patientRef: 'Enter the ward and bed, or the patient number' })

	const open = await findOpenForPatient(db, input.facilityId, key)
	if (open) throw new ApiError(409, 'already_open', `There is already an open request for this patient (${formatRequestNumber(open.number)}).`, { number: formatRequestNumber(open.number), ...(open.requesterId === user.id ? { id: open.id } : {}) })
	const cap = await numberSetting(db, 'requests.daily_cap', REQUEST_DEFAULTS.dailyCap)
	const dayStart = nairobiDayStart(now)
	if ((await countSentSince(db, user.id, dayStart)) >= cap) {
		throw new ApiError(429, 'daily_limit', `You can send ${cap} requests a day. Try again tomorrow.`, { resetsAt: new Date(dayStart.getTime() + 86_400_000).toISOString() })
	}

	const id = newId(now.getTime())
	const number = await insertRequest(
		db,
		{
			id,
			facilityId: input.facilityId,
			requesterId: user.id,
			source: 'public',
			patientRef: input.patientRef,
			patientRefKey: key,
			patientName: input.patientName || null,
			relation: input.relation,
			bloodTypeAsked: input.bloodType,
			unitsAsked: input.units,
			neededBy,
			urgencyAsked: input.urgency,
			note: input.note || null,
			status: 'pending',
			createdAt: now,
			updatedAt: now,
		},
		{ id: newId(now.getTime()), requestId: id, kind: 'sent', actorId: user.id, note: null, visibleToRequester: true, createdAt: now },
	)
	return c.json({ id, number: formatRequestNumber(number), status: 'pending' }, 201)
})

requestRoutes.get('/', requireAuth, async (c: Context<AuthEnv>) => {
	const bucket = c.req.query('bucket') ?? 'active'
	if (bucket !== 'active' && bucket !== 'closed') throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { bucket: 'Use active or closed' })
	const rows = await listForRequester(c.var.db, c.var.user.id, bucket === 'active')
	return c.json(rows.map(({ r, facilityName, facilityTown }) => summaryView(r, facilityName, facilityTown)))
})

requestRoutes.get('/:id', requireAuth, async (c: Context<AuthEnv>) => {
	const r = await mine(c)
	return c.json(await view(c, r.id))
})

requestRoutes.post('/:id/reply', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const r = await mine(c)
	const { message } = parseInput(replyInput, await readJson(c))
	const now = clock.now()
	if (!(await moveRequest(db, r.id, REQUEST_MOVES.reply.from, { status: REQUEST_MOVES.reply.to, updatedAt: now }))) throw new ApiError(409, 'invalid_move', 'The facility has no open question for you.')
	await addRequestEvent(db, { id: newId(now.getTime()), requestId: r.id, kind: 'replied', actorId: user.id, note: message, visibleToRequester: true, createdAt: now })
	return c.json(await view(c, r.id))
})

requestRoutes.post('/:id/cancel', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const r = await mine(c)
	const { reason } = parseInput(cancelInput, await c.req.json().catch(() => ({})))
	const now = clock.now()
	if (!(await moveRequest(db, r.id, REQUEST_MOVES.cancel.from, { status: REQUEST_MOVES.cancel.to, updatedAt: now }))) throw new ApiError(409, 'invalid_move', 'This request can no longer be cancelled.')
	await addRequestEvent(db, { id: newId(now.getTime()), requestId: r.id, kind: 'cancelled', actorId: user.id, note: reason || null, visibleToRequester: true, createdAt: now })
	const live = await getCallForRequest(db, r.id)
	if (live) await endCall(db, live, { status: 'closed', reason: 'cancelled', now, actorId: user.id, closeRequest: false, sms: c.var.sms })
	await writeAudit(db, { actorId: user.id, action: 'request.cancel', target: r.id }, now)
	return c.json(await view(c, r.id))
})
