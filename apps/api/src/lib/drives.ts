import { alertedForDrive, closeDriveRow, deleteInterest, driveInterestList, markDriveAlert, publishedSmsDrives, reserveDriveAlert, staleDrives, sweepInterest, type Db, type Drive } from '@damu/db'
import { BLOOD_TYPES, driveCancelledSms, driveChangedSms, driveSms } from '@damu/shared-types'
import type { AppConfig } from '../app'
import { matchDonors } from './alerts'
import { newId } from './id'
import { numberSetting } from './requests'
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

/** One text when a drive moves or is called off: interested guests with a phone, and signed-in donors with SMS on and a verified phone. Cancelling then deletes the list. */
export async function sendDriveNotice(db: Db, sms: Sms, config: AppConfig, d: Drive, kind: 'changed' | 'cancelled'): Promise<number> {
	const seen = new Set<string>()
	for (const r of await driveInterestList(db, d.id)) {
		const phone = r.userId ? (r.smsOk ? r.userPhone : null) : r.phone
		if (phone) seen.add(phone)
	}
	const text = kind === 'cancelled' ? driveCancelledSms(d) : driveChangedSms({ ...d, link: driveLink(config.appUrl, d.short).replace(/^https?:\/\//, '') })
	let n = 0
	for (const to of seen) {
		try {
			await sms.send({ to, text })
			n++
		} catch (e) {
			console.error('drive notice failed', e instanceof Error ? e.message : e)
		}
	}
	if (kind === 'cancelled') await deleteInterest(db, d.id) // a called-off drive has no use for the list
	return n
}

/** The clean-up, run by the tick: a drive still published the day after its date closes itself, and old interest rows go. */
export async function sweepDrives(db: Db, now: Date): Promise<number> {
	const day = nairobiDay(now)
	const old = await staleDrives(db, day)
	for (const d of old) await closeDriveRow(db, d, now)
	const days = await numberSetting(db, 'retention.drive_rsvp_days', 1)
	await sweepInterest(db, new Date(now.getTime() - days * 86_400_000), day)
	return old.length
}
