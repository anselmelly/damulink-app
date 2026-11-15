import { addRequestEvent, dueCalls, getCall, getCallForRequest, liveCallsOf, moveCall, moveRequest, responseCounts, type Call, type Db } from '@damu/db'
import { CALL_DEFAULTS, REQUEST_MOVES, formatCallNumber, type CallBrief, type CallStatus, type CallUnits } from '@damu/shared-types'
import { newId } from './id'
import { thankDonors } from './call-texts'
import type { Sms } from './services'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no look-alikes (i l o 0 1)
export function newShort(len = 5): string {
	const bytes = crypto.getRandomValues(new Uint8Array(len))
	return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export const unitsOf = (needed: number, k: { donated: number; scheduled: number }): CallUnits => ({ needed, donated: k.donated, scheduled: k.scheduled, stillNeeded: Math.max(0, needed - k.donated - k.scheduled) })

/** How many more days the call may still be extended (whole life is capped, counted from publishing). */
export const extendRoom = (c: Call): number => (c.status !== 'live' ? 0 : Math.max(0, Math.min(CALL_DEFAULTS.extendStepMax, Math.floor((c.publishedAt.getTime() + CALL_DEFAULTS.maxDays * 86_400_000 - c.closesAt.getTime()) / 86_400_000))))

/**
 * Ends a live call. Only the caller that wins the move does the rest, so a close racing an expiry happens once.
 * The request closes with it, unless the request itself was just cancelled.
 */
export async function endCall(db: Db, c: Call, o: { status: Exclude<CallStatus, 'live'>; reason: string | null; now: Date; actorId: string | null; closeRequest?: boolean; sms?: Sms }): Promise<boolean> {
	if (!(await moveCall(db, c.id, ['live'], { status: o.status, closedAt: o.now, closeReason: o.reason }))) return false
	if (o.closeRequest !== false && (await moveRequest(db, c.requestId, REQUEST_MOVES.close.from, { status: REQUEST_MOVES.close.to, updatedAt: o.now }))) {
		await addRequestEvent(db, { id: newId(o.now.getTime()), requestId: c.requestId, kind: 'closed', actorId: o.actorId, note: o.reason, visibleToRequester: true, createdAt: o.now })
	}
	if (o.sms) await thankDonors(db, o.sms, c)
	return true
}

/** Closes every live call whose time is up. Returns how many. Safe to run any time, from any number of places. */
export async function expireCalls(db: Db, now: Date, sms?: Sms): Promise<number> {
	let n = 0
	for (const c of await dueCalls(db, now)) if (await endCall(db, c, { status: 'expired', reason: 'expired', now, actorId: null, sms })) n++
	return n
}

/** A facility was suspended: its live calls come down and are not brought back when it returns. */
export async function takeDownCalls(db: Db, facilityId: string, now: Date, actorId: string): Promise<number> {
	let n = 0
	for (const c of await liveCallsOf(db, facilityId)) if (await endCall(db, c, { status: 'taken_down', reason: 'facility_suspended', now, actorId })) n++
	return n
}

/** What the requester sees of the call on their request: the number, the link and how many units are covered. No donor data. */
export async function callBrief(db: Db, requestId: string): Promise<CallBrief | null> {
	const c = await getCallForRequest(db, requestId)
	if (!c) return null
	const k = (await responseCounts(db, [c.id])).get(c.id)!
	return { id: c.id, number: formatCallNumber(c.number), short: c.short, status: c.status, closesAt: c.closesAt.toISOString(), units: c.unitsNeeded, covered: Math.min(k.donated, c.unitsNeeded) }
}
export { getCall }
