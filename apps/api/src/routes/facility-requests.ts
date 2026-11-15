import { Hono, type Context } from 'hono'
import {
	addRequestEvent,
	findUserById,
	getFacility,
	getMembership,
	getRequest,
	insertRequest,
	listFacilityRequests,
	moveRequest,
	requesterCounts,
	writeAudit,
	type BloodRequest,
} from '@damu/db'
import { REQUEST_MOVES, askInput, confirmInput, formatRequestNumber, maskPhone, patientKey, raiseInput, rejectInput, type FacilityRequestDetail, type FacilityRequestItem, type RequestAction } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { requestDecisionMessage } from '../lib/messages'
import { checkNeededBy, detailView } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import { alertPreview, publishCall, publishPreview } from './facility-calls'

/** Mounted at /api/my-facilities/:id/requests. Only people on the facility's team get in; everyone else sees "not found". */
export const facilityRequestRoutes = new Hono<AppEnv>()

async function team(c: Context<AuthEnv>, o: { verified: boolean }) {
	const id = c.req.param('id') ?? ''
	const m = await getMembership(c.var.db, id, c.var.user.id)
	const f = m ? await getFacility(c.var.db, id) : undefined
	if (!m || !f) throw new ApiError(404, 'not_found', 'Not found.')
	if (o.verified && f.status !== 'verified') throw new ApiError(403, 'facility_not_verified', 'Your facility must be verified to handle requests.')
	return { f, canDecide: m.role === 'admin' || m.canApprove }
}
async function ofFacility(c: Context<AuthEnv>, facilityId: string): Promise<BloodRequest> {
	const r = await getRequest(c.var.db, c.req.param('rid') ?? '')
	if (!r || r.facilityId !== facilityId) throw new ApiError(404, 'not_found', 'Not found.')
	return r
}

const item = (r: BloodRequest, requesterName: string | null): FacilityRequestItem => ({
	id: r.id,
	number: formatRequestNumber(r.number),
	status: r.status,
	source: r.source,
	patientRef: r.patientRef,
	bloodType: r.bloodType ?? r.bloodTypeAsked,
	units: r.units ?? r.unitsAsked,
	urgency: r.urgency ?? r.urgencyAsked,
	neededBy: r.neededBy.toISOString(),
	requesterName,
	createdAt: r.createdAt.toISOString(),
})

facilityRequestRoutes.get('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { f } = await team(c, { verified: false })
	const { rows, counts } = await listFacilityRequests(c.var.db, f.id, { status: c.req.query('status'), q: c.req.query('q'), bloodType: c.req.query('bloodType') })
	return c.json({ counts, items: rows.map(({ r, requesterName }) => item(r, requesterName)) })
})

/** A facility raises a request for its own patient. There is no approval step: it starts approved. */
facilityRequestRoutes.post('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f } = await team(c, { verified: true })
	const input = parseInput(raiseInput, await readJson(c))
	const now = clock.now()
	const neededBy = await checkNeededBy(db, input.neededBy, now)
	const key = patientKey(input.patientRef)
	if (!key) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { patientRef: 'Enter the ward and bed, or the patient number' })
	const id = newId(now.getTime())
	const number = await insertRequest(
		db,
		{
			id,
			facilityId: f.id,
			raisedBy: user.id,
			source: 'facility',
			patientRef: input.patientRef,
			patientRefKey: key,
			patientName: input.patientName || null,
			bloodTypeAsked: input.bloodType,
			unitsAsked: input.units,
			neededBy,
			urgencyAsked: input.urgency,
			internalNote: input.internalNote || null,
			status: 'approved',
			bloodType: input.bloodType,
			units: input.units,
			urgency: input.urgency,
			confirmedBy: user.id,
			confirmedAt: now,
			decidedBy: user.id,
			decidedAt: now,
			createdAt: now,
			updatedAt: now,
		},
		{ id: newId(now.getTime()), requestId: id, kind: 'raised', actorId: user.id, note: null, visibleToRequester: false, createdAt: now },
	)
	await writeAudit(db, { actorId: user.id, action: 'request.raise', target: id }, now)
	return c.json({ id, number: formatRequestNumber(number), status: 'approved' }, 201)
})

facilityRequestRoutes.get('/:rid', requireAuth, async (c: Context<AuthEnv>) => {
	const { db } = c.var
	const { f, canDecide } = await team(c, { verified: false })
	const r = await ofFacility(c, f.id)
	const who = r.requesterId ? await findUserById(db, r.requesterId) : undefined
	const body: FacilityRequestDetail = {
		...(await detailView(db, r, false)),
		source: r.source,
		internalNote: r.internalNote,
		requester: who ? { name: who.name, phone: maskPhone(who.phone), ...(await requesterCounts(db, who.id)) } : null,
		canDecide,
	}
	return c.json(body)
})

/**
 * One move of the review: checks who may do it, applies the table in `REQUEST_MOVES` atomically, records the event, the audit entry,
 * and emails the requester (a mail outage never undoes the decision).
 */
async function review(c: Context<AuthEnv>, action: Extract<RequestAction, 'confirm' | 'ask' | 'approve' | 'reject'>, o: { approver: boolean; changes?: Partial<BloodRequest>; note?: string | null; mail?: boolean }) {
	const { db, clock, mailer, config, user } = c.var
	const { f, canDecide } = await team(c, { verified: true })
	if (o.approver && !canDecide) throw new ApiError(403, 'not_approver', 'Only an admin or an attendant with approval permission can do this.')
	const r = await ofFacility(c, f.id)
	const now = clock.now()
	const move = REQUEST_MOVES[action]
	const extra = action === 'confirm' ? { confirmedBy: user.id, confirmedAt: now } : action === 'approve' || action === 'reject' ? { decidedBy: user.id, decidedAt: now } : {}
	if (!(await moveRequest(db, r.id, move.from, { ...o.changes, ...extra, status: move.to, updatedAt: now }))) throw new ApiError(409, 'invalid_move', `This request cannot be ${action === 'ask' ? 'asked about' : `${action}${action.endsWith('e') ? 'd' : 'ed'}`} right now.`)
	const kind = ({ confirm: 'confirmed', ask: 'asked', approve: 'approved', reject: 'rejected' } as const)[action]
	await addRequestEvent(db, { id: newId(now.getTime()), requestId: r.id, kind, actorId: user.id, note: o.note ?? null, visibleToRequester: true, createdAt: now })
	await writeAudit(db, { actorId: user.id, action: `request.${action}`, target: r.id }, now)
	if (o.mail && r.requesterId) {
		const who = await findUserById(db, r.requesterId)
		if (who) {
			try {
				await mailer.send(requestDecisionMessage(who.email, formatRequestNumber(r.number), f.name, action as 'approve' | 'reject' | 'ask', o.note ?? null, config.appUrl))
			} catch (e) {
				console.error('could not email the requester', e instanceof Error ? e.message : 'unknown error')
			}
		}
	}
	return c.json({ id: r.id, status: move.to })
}

facilityRequestRoutes.get('/:rid/publish-preview', requireAuth, publishPreview)
facilityRequestRoutes.post('/:rid/publish', requireAuth, publishCall)
facilityRequestRoutes.post('/:rid/alert-preview', requireAuth, alertPreview)
facilityRequestRoutes.post('/:rid/confirm', requireAuth, async (c: Context<AuthEnv>) => {
	const i = parseInput(confirmInput, await readJson(c))
	return review(c, 'confirm', { approver: false, changes: { bloodType: i.bloodType, units: i.units, urgency: i.urgency } })
})
facilityRequestRoutes.post('/:rid/ask', requireAuth, async (c: Context<AuthEnv>) => {
	const i = parseInput(askInput, await readJson(c))
	return review(c, 'ask', { approver: false, note: i.question, mail: true })
})
facilityRequestRoutes.post('/:rid/approve', requireAuth, async (c: Context<AuthEnv>) => review(c, 'approve', { approver: true, mail: true }))
facilityRequestRoutes.post('/:rid/reject', requireAuth, async (c: Context<AuthEnv>) => {
	const i = parseInput(rejectInput, await readJson(c))
	return review(c, 'reject', { approver: true, changes: { rejectReason: i.reason, rejectMessage: i.message || null }, note: i.message || null, mail: true })
})
