/** Dates arrive as YYYY-MM-DD (UTC) and are shown as "20 February 2027". */
export function longDate(d: string): string {
	return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
/** A moment (ISO string) shown in Nairobi time. */
export function nairobiDateTime(iso: string): string {
	return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
}
