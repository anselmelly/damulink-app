import { type Db, type User } from '@damu/db'
import { BRAND } from '@damu/shared-types'
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
