import { driveDay } from '@damu/shared-types'

export const DRIVE_PHASE: Record<string, [string, string]> = {
	draft: ['badge-warn', 'Draft'],
	published: ['badge-ok', 'Published'],
	open: ['badge-ok', 'Open today'],
	ended: ['badge-neutral', 'Ended'],
	closed: ['badge-neutral', 'Closed'],
	cancelled: ['badge-neutral', 'Cancelled'],
	taken_down: ['badge-warn', 'Taken down'],
}
export const monthOf = (date: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)).toUpperCase()
export const dayOf = (date: string) => Number(date.slice(8, 10))
export const longDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
export { driveDay }
