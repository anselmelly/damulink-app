import { alertedUserIds, alertRows, candidateDonors, donorPlaces, getFacility, heldUserIds, listResponses, markAlert, moveCall, reserveAlert, sentSince, type Call, type Db } from '@damu/db'
import { ALERT_LIMIT_DEFAULTS, BRAND, RING_COUNT, RING_DEFAULTS, alertText, checkEligibility, inQuietHours, ringOf } from '@damu/shared-types'
import type { AppConfig } from '../app'
import { getEligibilitySettings } from './eligibility'
import { newId } from './id'
import { getAlertLimits } from './prefs'
import { numberSetting } from './requests'
import type { Sms } from './services'
import { unitsOf } from './calls'

const nairobiHour = (d: Date) => (d.getUTCHours() + 3) % 24

/**
 * Donors who can be alerted for a call at `facilityId`, each with their ring (1 to 3).
 * `limits: false` counts the whole audience (the preview); true also holds back weekly-cap and quiet-hour donors on a normal call.
 */
export async function matchDonors(db: Db, o: { facilityId: string; types: string[]; urgency: string; callId?: string; now: Date; limits: boolean }) {
	const target = await getFacility(db, o.facilityId)
	if (!target) return []
	const km = { ring2Km: await numberSetting(db, 'rings.ring2_km', RING_DEFAULTS.ring2Km), ring3Km: await numberSetting(db, 'rings.ring3_km', RING_DEFAULTS.ring3Km) }
	const [rows, elig, sys] = [await candidateDonors(db, o.types), await getEligibilitySettings(db), await getAlertLimits(db)]
	const done = o.callId ? await alertedUserIds(db, o.callId) : new Set<string>()
	const places = await donorPlaces(db, rows.map((r) => r.u.id))
	const applyLimits = o.limits && o.urgency === 'normal'
	const sent = applyLimits ? await sentSince(db, rows.map((r) => r.u.id), new Date(o.now.getTime() - 7 * 86_400_000)) : new Map<string, number>()
	const today = o.now.toISOString().slice(0, 10)
	const held = await heldUserIds(db, rows.map((r) => r.u.id), today)
	const out: { user: (typeof rows)[number]['u']; ring: 1 | 2 | 3 }[] = []
	for (const { u, p } of rows) {
		if (done.has(u.id) || held.has(u.id)) continue
		if (!(p ? p.smsAlerts : u.smsOptIn)) continue
		if (p && (!p.available || (p.pausedUntil && p.pausedUntil > o.now))) continue
		if (checkEligibility({ sex: u.sex!, dateOfBirth: u.dateOfBirth!, today, lastDonationOn: u.lastDonationOn, weightKg: u.weightKg, settings: elig }).status !== 'eligible') continue
		const rings = (places.get(u.id) ?? []).map((f) => ringOf({ id: target.id, lat: target.lat, lng: target.lng, county: target.county }, f, km)).filter((r): r is 1 | 2 | 3 => r !== null)
		if (!rings.length) continue
		if (applyLimits) {
			if ((sent.get(u.id) ?? 0) >= (p?.weeklyCap ?? sys.weeklyCap)) continue
			if (inQuietHours(nairobiHour(o.now), p?.quietFrom ?? sys.quietFrom, p?.quietTo ?? sys.quietTo)) continue
		}
		out.push({ user: u, ring: Math.min(...rings) as 1 | 2 | 3 })
	}
	return out
}

const host = (url: string) => url.replace(/^https?:\/\//, '')
export async function alertMessage(db: Db, config: AppConfig, c: { facilityId: string; bloodType: string; short: string }): Promise<string> {
	const f = (await getFacility(db, c.facilityId))!
	return alertText(BRAND.name, c.bloodType, f.name, f.town, `${host(config.appUrl)}/c/${c.short}`)
}

/** The ring the schedule says should have gone out by now. Surge: all of them. */
export function dueRing(c: Pick<Call, 'urgency' | 'publishedAt'>, now: Date, h: { normalHours: number; urgentHours: number }): number {
	if (c.urgency === 'surge') return RING_COUNT
	const step = (c.urgency === 'urgent' ? h.urgentHours : h.normalHours) * 3600_000
	return Math.min(RING_COUNT, 1 + Math.floor((now.getTime() - c.publishedAt.getTime()) / step))
}

/** Texts every matching donor in rings up to `upTo` who has not been texted for this call. One by one, each reserved first. */
async function sendUpTo(db: Db, sms: Sms, config: AppConfig, call: Call, upTo: number, now: Date): Promise<number> {
	const text = await alertMessage(db, config, call)
	let n = 0
	for (const m of await matchDonors(db, { facilityId: call.facilityId, types: call.types, urgency: call.urgency, callId: call.id, now, limits: true })) {
		if (m.ring > upTo) continue
		const id = newId(now.getTime())
		if (!(await reserveAlert(db, { id, callId: call.id, userId: m.user.id, ring: m.ring, status: 'reserved', createdAt: now }))) continue
		try {
			await sms.send({ to: m.user.phone, text })
			await markAlert(db, id, { status: 'sent', sentAt: now })
			n++
		} catch (e) {
			await markAlert(db, id, { status: 'failed', error: (e instanceof Error ? e.message : 'send failed').slice(0, 200) })
		}
	}
	return n
}

/** Units scheduled or donated cover what was asked for. */
export async function covered(db: Db, c: Call): Promise<boolean> {
	const rs = await listResponses(db, c.id)
	return unitsOf(c.unitsNeeded, { donated: rs.filter((x) => x.r.status === 'donated').length, scheduled: rs.filter((x) => x.r.status === 'scheduled').length }).stillNeeded === 0
}

/** One pass for one live SMS call: the rings that are due (or `force`d one further), sent to everyone who qualifies now. Quiet-hour donors are picked up by a later pass. */
export async function runAlerts(db: Db, sms: Sms, config: AppConfig, call: Call, now: Date, force?: number): Promise<number> {
	if (call.status !== 'live' || !call.smsEnabled || (force == null && (await covered(db, call)))) return 0
	const h = { normalHours: await numberSetting(db, 'rings.normal_hours', RING_DEFAULTS.normalHours), urgentHours: await numberSetting(db, 'rings.urgent_hours', RING_DEFAULTS.urgentHours) }
	const upTo = Math.max(call.ringSent, force ?? 0, dueRing(call, now, h))
	const n = await sendUpTo(db, sms, config, call, upTo, now)
	if (upTo > call.ringSent) await moveCall(db, call.id, ['live'], { ringSent: upTo })
	return n
}

export async function ringStats(db: Db, call: Call, now: Date) {
	const rows = await alertRows(db, call.id)
	const answered = new Set((await listResponses(db, call.id)).map((x) => x.r.userId))
	const left = await matchDonors(db, { facilityId: call.facilityId, types: call.types, urgency: call.urgency, callId: call.id, now, limits: false })
	return [1, 2, 3].map((ring) => {
		const sent = rows.filter((r) => r.ring === ring && r.status === 'sent')
		return { ring, toAlert: left.filter((m) => m.ring === ring).length, alerted: sent.length, replied: sent.filter((r) => answered.has(r.userId)).length }
	})
}
