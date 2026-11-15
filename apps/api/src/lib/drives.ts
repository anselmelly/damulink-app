import { alertedForDrive, markDriveAlert, publishedSmsDrives, reserveDriveAlert, type Db, type Drive } from '@damu/db'
import { BLOOD_TYPES, driveSms } from '@damu/shared-types'
import type { AppConfig } from '../app'
import { matchDonors } from './alerts'
import { newId } from './id'
import type { Sms } from './services'

/** The drive starts at `starts` on its date, Nairobi time. */
export const driveStart = (d: Pick<Drive, 'date' | 'starts'>) => new Date(`${d.date}T${d.starts}:00+03:00`)
export const nairobiDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
export const driveLink = (appUrl: string, short: string) => `${appUrl.replace(/\/$/, '')}/d/${short}`
export const driveText = (config: AppConfig, d: Drive) => driveSms({ host: d.host, town: d.town, date: d.date, starts: d.starts, ends: d.ends, link: driveLink(config.appUrl, d.short).replace(/^https?:\/\//, '') })

/** Verified donors likely eligible on the drive date, alerts on, inside the facility's rings, any blood type. Counts only. */
export async function driveAudience(db: Db, d: Drive, now: Date, limits = false) {
	const skip = await alertedForDrive(db, d.id)
	const people = await matchDonors(db, { facilityId: d.facilityId, types: [...BLOOD_TYPES], urgency: 'normal', skip, onDay: d.date, now, limits })
	return { total: people.length, ring1: people.filter((p) => p.ring === 1).length, ring2: people.filter((p) => p.ring === 2).length, ring3: people.filter((p) => p.ring === 3).length, people }
}

/** Texts every matching donor who has not been texted for this drive, once each, each reserved first. Night-time and capped donors are picked up by a later pass. */
export async function runDriveAlerts(db: Db, sms: Sms, config: AppConfig, d: Drive, now: Date): Promise<number> {
	if (d.status !== 'published' || !d.smsEnabled || nairobiDay(now) > d.date) return 0
	const text = driveText(config, d)
	let n = 0
	for (const m of (await driveAudience(db, d, now, true)).people) {
		const id = newId(now.getTime())
		if (!(await reserveDriveAlert(db, { id, driveId: d.id, userId: m.user.id, status: 'reserved', createdAt: now }))) continue
		try {
			await sms.send({ to: m.user.phone, text })
			await markDriveAlert(db, id, { status: 'sent', sentAt: now })
			n++
		} catch (e) {
			await markDriveAlert(db, id, { status: 'failed', error: (e instanceof Error ? e.message : 'send failed').slice(0, 200) })
		}
	}
	return n
}

export async function runAllDriveAlerts(db: Db, sms: Sms, config: AppConfig, now: Date): Promise<number> {
	let n = 0
	for (const d of await publishedSmsDrives(db, nairobiDay(now))) n += await runDriveAlerts(db, sms, config, d, now)
	return n
}
