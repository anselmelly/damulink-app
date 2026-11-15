import { findUserById, getFacility, getPrefs, listResponses, type Call, type Db, type User } from '@damu/db'
import { BRAND } from '@damu/shared-types'
import type { Sms } from './services'

/** SMS alerts are on unless the donor switched them off (saved preferences first, the account setting otherwise). */
export async function smsOn(db: Db, u: Pick<User, 'id' | 'smsOptIn'>): Promise<boolean> {
	const p = await getPrefs(db, u.id)
	return p ? p.smsAlerts : u.smsOptIn
}

/** Sends one text to a donor who still wants them. A provider failure is logged, never thrown: the facility's action already happened. */
export async function textDonor(db: Db, sms: Sms, u: Pick<User, 'id' | 'phone' | 'smsOptIn'>, text: string, force = false): Promise<boolean> {
	if (!force && !(await smsOn(db, u))) return false
	try {
		await sms.send({ to: u.phone, text })
		return true
	} catch (e) {
		console.error('could not send sms', e instanceof Error ? e.message : 'unknown error')
		return false
	}
}

const when = (d: Date) => d.toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })

export async function textScheduled(db: Db, sms: Sms, call: Call, userId: string, at: Date): Promise<void> {
	const [u, f] = [await findUserById(db, userId), await getFacility(db, call.facilityId)]
	if (u && f) await textDonor(db, sms, u, `${BRAND.name}: you are booked to donate at ${f.name} on ${when(at)}. Please bring your ID.`)
}

/** When a call ends: a thank-you to donors who said yes and were not scheduled or needed. */
export async function thankDonors(db: Db, sms: Sms, call: Call): Promise<void> {
	const f = await getFacility(db, call.facilityId)
	if (!f) return
	for (const { r } of await listResponses(db, call.id)) {
		if (r.status !== 'willing' && r.status !== 'not_needed') continue
		const u = await findUserById(db, r.userId)
		if (u) await textDonor(db, sms, u, `${BRAND.name}: thank you for answering the call at ${f.name}. It is closed now, and you were not needed this time. We will call on you again.`)
	}
}
