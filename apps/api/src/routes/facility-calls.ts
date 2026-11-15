import { Hono, type Context } from 'hono'
import {
	addRequestEvent,
	getCall,
	getFacility,
	getMembership,
	getRequest,
	getResponse,
	insertCall,
	listFacilityCalls,
	listResponses,
	moveCall,
	moveRequest,
	moveResponse,
	responseCounts,
	writeAudit,
	type Call,
} from '@damu/db'
import { CALL_DEFAULTS, REQUEST_MOVES, callEditInput, closeInput, compatibleTypes, extendInput, formatCallNumber, formatRequestNumber, publicTextProblem, publishInput, scheduleInput, alertPreviewInput, suggestedCallText, type CallDetail, type CallItem, type PublishPreview } from '@damu/shared-types'
import { maskPhone } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { alertMessage, matchDonors, ringStats, runAlerts } from '../lib/alerts'
import { textScheduled } from '../lib/call-texts'
import { endCall, expireCalls, extendRoom, newShort, unitsOf } from '../lib/calls'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { numberSetting } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** Mounted at /api/my-facilities/:id/calls. Only the facility's team gets in; everyone else sees "not found". */
export const facilityCallRoutes = new Hono<AppEnv>()

async function team(c: Context<AuthEnv>, o: { verified: boolean }) {
	const id = c.req.param('id') ?? ''
	const m = await getMembership(c.var.db, id, c.var.user.id)
	const f = m ? await getFacility(c.var.db, id) : undefined
	if (!m || !f) throw new ApiError(404, 'not_found', 'Not found.')
	if (o.verified && f.status !== 'verified') throw new ApiError(403, 'facility_not_verified', 'Your facility must be verified to manage calls.')
	return { f }
}
async function ofFacility(c: Context<AuthEnv>, facilityId: string): Promise<Call> {
	const call = await getCall(c.var.db, c.req.param('cid') ?? '')
	if (!call || call.facilityId !== facilityId) throw new ApiError(404, 'not_found', 'Not found.')
	return call
}
const invalid = (fields: Record<string, string>) => new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', fields)

/** The donor types must be part of the compatible set, and there must be at least one. */
function checkTypes(types: string[], patientType: string) {
	const ok = compatibleTypes(patientType)
	if (!types.length || types.some((t) => !ok.includes(t))) throw invalid({ types: `Choose from ${ok.join(', ')}` })
}

// ---- publishing lives under the request, so it is mounted from facility-requests as well
export async function publishPreview(c: Context<AuthEnv>) {
	const { f } = await team(c, { verified: true })
	const r = await getRequest(c.var.db, c.req.param('rid') ?? '')
	if (!r || r.facilityId !== f.id) throw new ApiError(404, 'not_found', 'Not found.')
	if (r.status !== 'approved' || !r.bloodType) throw new ApiError(409, 'invalid_move', 'Only an approved request can be published.')
	const body: PublishPreview = {
		compatibleTypes: compatibleTypes(r.bloodType),
		suggestedText: suggestedCallText(r.bloodType),
		textMax: await numberSetting(c.var.db, 'calls.text_max', CALL_DEFAULTS.textMax),
		urgency: r.urgency ?? r.urgencyAsked,
		bloodType: r.bloodType,
		units: r.units ?? r.unitsAsked,
		facilityName: f.name,
		facilityTown: f.town,
	}
	return c.json(body)
}

/** Who would be alerted per ring for these types and urgency, and the text. Changes nothing. */
export async function alertPreview(c: Context<AuthEnv>) {
	const { db, clock, config } = c.var
	const { f } = await team(c, { verified: true })
	const r = await getRequest(db, c.req.param('rid') ?? '')
	if (!r || r.facilityId !== f.id) throw new ApiError(404, 'not_found', 'Not found.')
	if (r.status !== 'approved' || !r.bloodType) throw new ApiError(409, 'invalid_move', 'Only an approved request can be published.')
	const input = parseInput(alertPreviewInput, await readJson(c))
	checkTypes(input.types, r.bloodType)
	const found = await matchDonors(db, { facilityId: f.id, types: input.types, urgency: input.urgency, now: clock.now(), limits: false })
	const text = await alertMessage(db, config, { facilityId: f.id, bloodType: r.bloodType, short: 'xxxxx' })
	return c.json({ rings: [1, 2, 3].map((ring) => ({ ring, count: found.filter((m) => m.ring === ring).length })), total: found.length, text, length: text.length })
}

export async function publishCall(c: Context<AuthEnv>) {
	const { db, clock, user } = c.var
	const { f } = await team(c, { verified: true })
	const r = await getRequest(db, c.req.param('rid') ?? '')
	if (!r || r.facilityId !== f.id) throw new ApiError(404, 'not_found', 'Not found.')
	const input = parseInput(publishInput, await readJson(c))
	if (r.status !== 'approved' || !r.bloodType || !r.units) throw new ApiError(409, 'invalid_move', 'Only an approved request can be published.')
	checkTypes(input.types, r.bloodType)
	const max = await numberSetting(db, 'calls.text_max', CALL_DEFAULTS.textMax)
	const bad = publicTextProblem(input.publicText, r, max)
	if (bad) throw invalid({ publicText: bad })
	if (!input.isPublic && !input.smsEnabled) throw invalid({ isPublic: 'Turn on the public call or SMS alerts' })

	const now = clock.now()
	if (!(await moveRequest(db, r.id, REQUEST_MOVES.publish.from, { status: REQUEST_MOVES.publish.to, updatedAt: now }))) throw new ApiError(409, 'invalid_move', 'This request cannot be published right now.')
	const id = newId(now.getTime())
	const closesAt = new Date(now.getTime() + CALL_DEFAULTS.baseDays * 86_400_000)
	const { number, short } = await insertCall(
		db,
		{ id, requestId: r.id, facilityId: f.id, bloodType: r.bloodType, types: input.types, urgency: input.urgency, publicText: input.publicText, isPublic: input.isPublic, smsEnabled: input.smsEnabled, status: 'live', unitsNeeded: r.units, publishedAt: now, closesAt, createdBy: user.id },
		newShort,
	)
	await addRequestEvent(db, { id: newId(now.getTime()), requestId: r.id, kind: 'published', actorId: user.id, note: null, visibleToRequester: true, createdAt: now })
	await writeAudit(db, { actorId: user.id, action: 'call.publish', target: id }, now)
	if (input.smsEnabled) await runAlerts(db, c.var.sms, c.var.config, (await getCall(db, id))!, now).catch((e) => console.error('alerts failed', e instanceof Error ? e.message : 'unknown error'))
	return c.json({ id, number: formatCallNumber(number), short, status: 'live', closesAt: closesAt.toISOString() }, 201)
}

facilityCallRoutes.get('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock } = c.var
	const { f } = await team(c, { verified: false })
	await expireCalls(db, clock.now(), c.var.sms)
	const rows = await listFacilityCalls(db, f.id)
	const k = await responseCounts(db, rows.map((x) => x.id))
	const reqs = new Map<string, number>()
	for (const x of rows) reqs.set(x.id, (await getRequest(db, x.requestId))?.number ?? 0)
	const items: CallItem[] = rows.map((x) => ({
		id: x.id,
		number: formatCallNumber(x.number),
		short: x.short,
		status: x.status,
		urgency: x.urgency,
		bloodType: x.bloodType,
		requestId: x.requestId,
		requestNumber: formatRequestNumber(reqs.get(x.id) ?? 0),
		publishedAt: x.publishedAt.toISOString(),
		closesAt: x.closesAt.toISOString(),
		stillNeeded: unitsOf(x.unitsNeeded, k.get(x.id)!).stillNeeded,
		yes: k.get(x.id)!.yes,
	}))
	return c.json({ items })
})

async function detailOf(c: Context<AuthEnv>, call: Call): Promise<CallDetail> {
	const { db } = c.var
	const req = (await getRequest(db, call.requestId))!
	const k = (await responseCounts(db, [call.id])).get(call.id)!
	return {
		id: call.id,
		number: formatCallNumber(call.number),
		short: call.short,
		status: call.status,
		urgency: call.urgency,
		bloodType: call.bloodType,
		types: call.types,
		publicText: call.publicText,
		isPublic: call.isPublic,
		smsEnabled: call.smsEnabled,
		publishedAt: call.publishedAt.toISOString(),
		closesAt: call.closesAt.toISOString(),
		extendedDays: call.extendedDays,
		canExtendDays: extendRoom(call),
		closedAt: call.closedAt?.toISOString() ?? null,
		closeReason: call.closeReason,
		request: { id: req.id, number: formatRequestNumber(req.number), patientRef: req.patientRef, status: req.status },
		units: unitsOf(call.unitsNeeded, k),
		responses: (await listResponses(db, call.id)).map(({ r, name, phone, bloodType }) => ({ id: r.id, name, phone: maskPhone(phone), bloodType, ring: r.ring, status: r.status, repliedAt: r.repliedAt.toISOString(), scheduledAt: r.scheduledAt?.toISOString() ?? null })),
	}
}

facilityCallRoutes.get('/:cid', requireAuth, async (c: Context<AuthEnv>) => {
	const { f } = await team(c, { verified: false })
	await expireCalls(c.var.db, c.var.clock.now(), c.var.sms)
	return c.json(await detailOf(c, await ofFacility(c, f.id)))
})

facilityCallRoutes.patch('/:cid', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const { f } = await team(c, { verified: true })
	const call = await ofFacility(c, f.id)
	const input = parseInput(callEditInput, await readJson(c))
	const req = (await getRequest(db, call.requestId))!
	if (input.types) checkTypes(input.types, call.bloodType)
	if (input.publicText !== undefined) {
		const bad = publicTextProblem(input.publicText, req, await numberSetting(db, 'calls.text_max', CALL_DEFAULTS.textMax))
		if (bad) throw invalid({ publicText: bad })
	}
	if (!(await moveCall(db, call.id, ['live'], { ...(input.types ? { types: input.types } : {}), ...(input.publicText !== undefined ? { publicText: input.publicText } : {}) }))) throw new ApiError(409, 'invalid_move', 'This call has ended.')
	await writeAudit(db, { actorId: user.id, action: 'call.edit', target: call.id }, clock.now())
	return c.json(await detailOf(c, (await getCall(db, call.id))!))
})

facilityCallRoutes.post('/:cid/extend', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const { f } = await team(c, { verified: true })
	await expireCalls(db, clock.now(), c.var.sms)
	const call = await ofFacility(c, f.id)
	const { days } = parseInput(extendInput, await readJson(c))
	if (call.status !== 'live') throw new ApiError(409, 'invalid_move', 'This call has ended.')
	const room = Math.min(extendRoom(call), await numberSetting(db, 'calls.extend_step_max', CALL_DEFAULTS.extendStepMax))
	if (days > room) throw invalid({ days: room ? `You can add at most ${room} more day${room === 1 ? '' : 's'}` : `A call can stay open for ${CALL_DEFAULTS.maxDays} days in all` })
	const closesAt = new Date(call.closesAt.getTime() + days * 86_400_000)
	if (!(await moveCall(db, call.id, ['live'], { closesAt, extendedDays: call.extendedDays + days }))) throw new ApiError(409, 'invalid_move', 'This call has ended.')
	await writeAudit(db, { actorId: user.id, action: 'call.extend', target: call.id, detail: String(days) }, clock.now())
	return c.json({ id: call.id, closesAt: closesAt.toISOString() })
})

facilityCallRoutes.post('/:cid/close', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const { f } = await team(c, { verified: true })
	const call = await ofFacility(c, f.id)
	const { reason } = parseInput(closeInput, await readJson(c))
	const now = clock.now()
	if (!(await endCall(db, call, { status: 'closed', reason, now, actorId: user.id, sms: c.var.sms }))) throw new ApiError(409, 'invalid_move', 'This call has already ended.')
	await writeAudit(db, { actorId: user.id, action: 'call.close', target: call.id, detail: reason }, now)
	return c.json({ id: call.id, status: 'closed' })
})

/** schedule / not-needed on one donor's answer, only while the call is live. */
async function respondTo(c: Context<AuthEnv>, what: 'schedule' | 'not-needed') {
	const { db, user, clock } = c.var
	const { f } = await team(c, { verified: true })
	await expireCalls(db, clock.now(), c.var.sms)
	const call = await ofFacility(c, f.id)
	const row = await getResponse(db, call.id, c.req.param('rsid') ?? '')
	if (!row) throw new ApiError(404, 'not_found', 'Not found.')
	if (call.status !== 'live') throw new ApiError(409, 'invalid_move', 'This call has ended.')
	const now = clock.now()
	let changes: Parameters<typeof moveResponse>[3]
	let from: readonly Parameters<typeof moveResponse>[2][number][]
	if (what === 'schedule') {
		const { scheduledAt } = parseInput(scheduleInput, await readJson(c))
		const at = new Date(scheduledAt)
		if (at.getTime() <= now.getTime()) throw invalid({ scheduledAt: 'Choose a time in the future' })
		changes = { status: 'scheduled', scheduledAt: at }
		from = ['willing', 'scheduled']
	} else {
		changes = { status: 'not_needed' }
		from = ['willing', 'scheduled']
	}
	if (!(await moveResponse(db, row.id, from, changes))) throw new ApiError(409, 'invalid_move', 'This donor can no longer be changed.')
	await writeAudit(db, { actorId: user.id, action: `call.${what === 'schedule' ? 'schedule' : 'not_needed'}`, target: row.id }, now)
	if (what === 'schedule' && changes.scheduledAt) await textScheduled(db, c.var.sms, call, row.userId, changes.scheduledAt as Date)
	return c.json({ id: row.id, status: changes.status })
}
facilityCallRoutes.post('/:cid/responses/:rsid/schedule', requireAuth, (c: Context<AuthEnv>) => respondTo(c, 'schedule'))
facilityCallRoutes.post('/:cid/responses/:rsid/not-needed', requireAuth, (c: Context<AuthEnv>) => respondTo(c, 'not-needed'))

facilityCallRoutes.get('/:cid/rings', requireAuth, async (c: Context<AuthEnv>) => {
	const { f } = await team(c, { verified: false })
	const call = await ofFacility(c, f.id)
	return c.json({ rings: await ringStats(c.var.db, call, c.var.clock.now()), nextRing: call.status === 'live' && call.smsEnabled && call.ringSent < 3 ? call.ringSent + 1 : null })
})

/** Sends the next ring now. */
facilityCallRoutes.post('/:cid/alert-more', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f } = await team(c, { verified: true })
	const call = await ofFacility(c, f.id)
	if (call.status !== 'live' || !call.smsEnabled || call.ringSent >= 3) throw new ApiError(409, 'invalid_move', 'There is no one more to alert for this call.')
	const now = clock.now()
	const sent = await runAlerts(db, c.var.sms, c.var.config, call, now, call.ringSent + 1)
	await writeAudit(db, { actorId: user.id, action: 'call.alert_more', target: call.id, detail: String(call.ringSent + 1) }, now)
	return c.json({ ring: call.ringSent + 1, sent })
})
