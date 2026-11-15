import { insertFlag, lastResolved, noShowsSince, rejectedSince, writeAudit, type Db } from '@damu/db'
import { MISUSE_DEFAULTS, formatRequestNumber } from '@damu/shared-types'
import { newId } from './id'
import { numberSetting } from './requests'

const DAY = 86_400_000
const WHY: Record<string, string> = { no_match: 'no matching patient at the facility', already_given: 'blood already given', requirements: 'requirements not met', other: 'other reason' }

/**
 * Misuse rules, run by the cron tick. A flag is a prompt to look, never a penalty. One open flag per person per reason;
 * once one is dismissed or acted on, only evidence newer than that counts, so the same history never raises it again.
 */
export async function runFlagRules(db: Db, now: Date): Promise<number> {
	let raised = 0
	const flag = async (userId: string, kind: 'rejected_requests' | 'no_shows', reason: string, evidence: { ref: string; note: string; at: string }[]) => {
		if (await insertFlag(db, { id: newId(now.getTime()), userId, kind, reason, evidence, now })) {
			await writeAudit(db, { actorId: null, action: 'user.flag', target: userId, detail: reason }, now)
			raised++
		}
	}
	const count = await numberSetting(db, 'misuse.rejected_count', MISUSE_DEFAULTS.rejectedCount)
	const days = await numberSetting(db, 'misuse.rejected_days', MISUSE_DEFAULTS.rejectedDays)
	const byUser = new Map<string, Awaited<ReturnType<typeof rejectedSince>>>()
	for (const r of await rejectedSince(db, new Date(now.getTime() - days * DAY))) byUser.set(r.userId!, [...(byUser.get(r.userId!) ?? []), r])
	for (const [userId, all] of byUser) {
		const since = await lastResolved(db, userId, 'rejected_requests')
		const rows = since ? all.filter((r) => r.at! > since) : all
		if (rows.length >= count) await flag(userId, 'rejected_requests', `${rows.length} requests rejected in ${days} days`, rows.map((r) => ({ ref: formatRequestNumber(r.number), note: `rejected: ${WHY[r.reason ?? 'other'] ?? 'other reason'}`, at: r.at!.toISOString() })))
	}

	const need = await numberSetting(db, 'misuse.noshow_facilities', MISUSE_DEFAULTS.noshowFacilities)
	const nsDays = await numberSetting(db, 'misuse.noshow_days', MISUSE_DEFAULTS.noshowDays)
	const ns = new Map<string, Awaited<ReturnType<typeof noShowsSince>>>()
	for (const r of await noShowsSince(db, new Date(now.getTime() - nsDays * DAY))) ns.set(r.userId, [...(ns.get(r.userId) ?? []), r])
	for (const [userId, all] of ns) {
		const since = await lastResolved(db, userId, 'no_shows')
		const rows = since ? all.filter((r) => r.at > since) : all
		const facilities = new Set(rows.map((r) => r.facilityId))
		if (facilities.size >= need) await flag(userId, 'no_shows', `Did not attend after booking at ${facilities.size} facilities in ${nsDays} days`, rows.map((r) => ({ ref: r.facility, note: 'no-show', at: r.at.toISOString() })))
	}
	return raised
}
