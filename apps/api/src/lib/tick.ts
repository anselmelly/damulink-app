import { liveSmsCalls, type Db } from '@damu/db'
import type { AppConfig } from '../app'
import { runAlerts } from './alerts'
import { expireCalls } from './calls'
import type { Sms } from './services'

/** The scheduled work: close calls whose time is up, then send whatever alerts are due. Safe to run as often and from as many places as you like. */
export async function runTick(db: Db, sms: Sms, config: AppConfig, now: Date) {
	const expired = await expireCalls(db, now, sms)
	let alerted = 0
	for (const c of await liveSmsCalls(db)) alerted += await runAlerts(db, sms, config, c, now)
	return { expired, alerted }
}
