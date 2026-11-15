import { getSetting, listRequestEvents, type BloodRequest, type Db, type RequestEvent } from '@damu/db'
import { REQUEST_DEFAULTS, formatRequestNumber, type RequestDetail, type RequestEventView, type RequestSummary } from '@damu/shared-types'
import { callBrief } from './calls'
import { ApiError } from './errors'

/** Nairobi is UTC+3 all year (no daylight saving): the start of the Nairobi calendar day that contains `now`. */
export function nairobiDayStart(now: Date): Date {
	const offset = 3 * 3600_000
	return new Date(Math.floor((now.getTime() + offset) / 86_400_000) * 86_400_000 - offset)
}

/** A numeric setting, or the default when it is missing or damaged. */
export async function numberSetting(db: Db, key: string, fallback: number): Promise<number> {
	const v = await getSetting<unknown>(db, key)
	return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
}

/** needed-by must be in the future and within the allowed number of days. */
export async function checkNeededBy(db: Db, neededBy: string, now: Date): Promise<Date> {
	const at = new Date(neededBy)
	const days = await numberSetting(db, 'requests.max_days_ahead', REQUEST_DEFAULTS.maxDaysAhead)
	if (at.getTime() <= now.getTime()) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { neededBy: 'Choose a time in the future' })
	if (at.getTime() > now.getTime() + days * 86_400_000) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { neededBy: `Choose a time within ${days} days` })
	return at
}

export const eventView = (e: RequestEvent): RequestEventView => ({ kind: e.kind, text: e.note, at: e.createdAt.toISOString() })

export const summaryView = (r: BloodRequest, facilityName: string, facilityTown: string): RequestSummary => ({
	id: r.id,
	number: formatRequestNumber(r.number),
	status: r.status,
	facilityName,
	facilityTown,
	bloodType: r.bloodType ?? r.bloodTypeAsked,
	units: r.units ?? r.unitsAsked,
	neededBy: r.neededBy.toISOString(),
	createdAt: r.createdAt.toISOString(),
})

/** The fields both screens share. Patient details are included, so only call this for the requester or the facility's team. */
export async function detailView(db: Db, r: BloodRequest, requesterOnly: boolean): Promise<Omit<RequestDetail, 'facility'>> {
	const events = await listRequestEvents(db, r.id, requesterOnly)
	const asked = r.status === 'needs_info' ? [...events].reverse().find((e) => e.kind === 'asked') : undefined
	return {
		id: r.id,
		number: formatRequestNumber(r.number),
		status: r.status,
		patientRef: r.patientRef,
		patientName: r.patientName,
		relation: r.relation,
		bloodTypeAsked: r.bloodTypeAsked,
		unitsAsked: r.unitsAsked,
		urgencyAsked: r.urgencyAsked,
		neededBy: r.neededBy.toISOString(),
		note: r.note,
		blood: r.bloodType && r.units && r.urgency ? { bloodType: r.bloodType, units: r.units, urgency: r.urgency } : null,
		question: asked?.note ?? null,
		rejectReason: r.rejectReason,
		rejectMessage: r.rejectMessage,
		timeline: events.map(eventView),
		call: await callBrief(db, r.id),
		createdAt: r.createdAt.toISOString(),
	}
}
