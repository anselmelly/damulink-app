/** Draft values; the super admin edits them later through settings rows. */
export const RING_DEFAULTS = { ring2Km: 10, ring3Km: 25, normalHours: 12, urgentHours: 2 }
export const RING_COUNT = 3
/** A YES counts for this long after the alert. */
export const YES_WINDOW_HOURS = 48

/** Straight-line distance in kilometres between two points (degrees). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const rad = (d: number) => (d * Math.PI) / 180
	const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
	return 12742 * Math.asin(Math.sqrt(h))
}

type Place = { id: string; lat: number | null; lng: number | null; county: string }
/** The ring a donor's facility puts them in for a call at `target`: 1 own facility, 2 near, 3 wider or same county; null when outside. */
export function ringOf(target: Place, f: Place, km: { ring2Km: number; ring3Km: number }): 1 | 2 | 3 | null {
	if (f.id === target.id) return 1
	const d = target.lat != null && target.lng != null && f.lat != null && f.lng != null ? distanceKm({ lat: target.lat, lng: target.lng }, { lat: f.lat, lng: f.lng }) : Infinity
	if (d <= km.ring2Km) return 2
	if (d <= km.ring3Km || (!!target.county && target.county.toLowerCase() === f.county.toLowerCase())) return 3
	return null
}

/** True when `hour` (0-23, Nairobi) falls in quiet hours from `from` up to `to`; the range may wrap midnight. */
export const inQuietHours = (hour: number, from: number, to: number) => (from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to)

/** The one alert text: the preview and the real message are built here. `link` has no scheme. */
export const alertText = (brand: string, bloodType: string, facility: string, town: string, link: string) =>
	`${brand}: ${bloodType} blood needed at ${facility}, ${town}. Reply YES if you can come, or open ${link}. Reply STOP to stop alerts.`

// ---------- a donor's own list of calls
export type DonorCall = { code: string; short: string; bloodType: string; facility: string; town: string; urgency: string; postedAt: string; stillNeeded: number; where: string; accepted: boolean }
export type DonorCalls = { state: 'ok' | 'unverified' | 'waiting'; nextEligibleOn?: string; items: DonorCall[] }
