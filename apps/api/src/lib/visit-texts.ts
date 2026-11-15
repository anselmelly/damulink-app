import { type Db, type User } from '@damu/db'
import { BRAND, DECLINE_REASONS, type DeclineReason } from '@damu/shared-types'
import { textDonor } from './call-texts'
import type { Sms } from './services'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** After a donation: thanks and the next date they can give. Nothing else about the visit. */
export const textDonation = (db: Db, sms: Sms, u: Pick<User, 'id' | 'phone' | 'smsOptIn'>, facilityName: string, nextOn: string) =>
	textDonor(db, sms, u, `${BRAND.name}: thank you for donating at ${facilityName}. You can donate again from ${day(nextOn)}.`)

/** When a blood type is recorded: the donor can now be matched to calls. */
export const textVerified = (db: Db, sms: Sms, u: Pick<User, 'id' | 'phone' | 'smsOptIn'>, bloodType: string) =>
	textDonor(db, sms, u, `${BRAND.name}: you are now verified, blood type ${bloodType}. You can be matched to calls that need you.`)

/** To someone who donated without an account and asked for an invitation. Sent once, to a number that is then deleted. */
export async function textWalkinInvite(sms: Sms, to: string, facilityName: string, link: string): Promise<boolean> {
	try {
		await sms.send({ to, text: `${BRAND.name}: thank you for donating at ${facilityName}. Make an account so facilities can reach you when your blood type is needed: ${link}` })
		return true
	} catch (e) {
		console.error('could not send sms', e instanceof Error ? e.message : 'unknown error')
		return false
	}
}

const at = (d: Date) => d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })

/** A visit was booked or moved. Date, place and the donor code, nothing else. */
export const textBooked = (db: Db, sms: Sms, u: Pick<User, 'id' | 'phone' | 'smsOptIn'>, o: { facility: string; when: Date; code: string; kind: 'test' | 'donate'; moved: boolean }) =>
	textDonor(db, sms, u, `${BRAND.name}: ${o.moved ? `your visit at ${o.facility} was moved to` : `you are booked at ${o.facility} on`} ${at(o.when)} for ${o.kind === 'donate' ? 'a donation' : 'a blood type test'}. Bring your donor code ${o.code}.`)

/** A request was declined or a booked visit cancelled by the facility. Only the listed reason, never a note. */
export const textVisitCancelled = (db: Db, sms: Sms, u: Pick<User, 'id' | 'phone' | 'smsOptIn'>, facility: string, reason: DeclineReason) =>
	textDonor(db, sms, u, `${BRAND.name}: ${facility} could not take your visit. ${reason === 'other' ? 'Please contact the facility.' : `${DECLINE_REASONS[reason]}.`} You can ask again any time.`)
