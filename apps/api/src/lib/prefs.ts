import { z } from 'zod'
import { getSetting, type Db } from '@damu/db'
import { ALERT_LIMIT_DEFAULTS } from '@damu/shared-types'

const shape = z.object({ weeklyCap: z.number().int().min(1), quietFrom: z.number().int().min(0).max(23), quietTo: z.number().int().min(0).max(23) })

/** The system alert limits (settings table); a missing or damaged value means the defaults. */
export async function getAlertLimits(db: Db): Promise<typeof ALERT_LIMIT_DEFAULTS> {
	const r = shape.safeParse(await getSetting<unknown>(db, 'alert_limits'))
	return r.success ? r.data : ALERT_LIMIT_DEFAULTS
}

/** `now` plus a pause choice; months are calendar months (a day that does not exist moves to the month's last day). */
export function pauseUntil(choice: '1w' | '2w' | '1m' | '3m', now: Date): Date {
	if (choice === '1w' || choice === '2w') return new Date(now.getTime() + (choice === '1w' ? 7 : 14) * 86_400_000)
	const months = choice === '1m' ? 1 : 3
	const total = now.getUTCFullYear() * 12 + now.getUTCMonth() + months
	const y = Math.floor(total / 12)
	const m = total % 12
	const day = Math.min(now.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate())
	return new Date(Date.UTC(y, m, day, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()))
}
