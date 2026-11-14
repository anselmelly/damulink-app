import { BRAND } from '@damu/shared-types'
import type { MailMessage, SmsMessage } from './services'

export function verifyEmailMessage(to: string, appUrl: string, token: string): MailMessage {
	return {
		to,
		subject: `Confirm your email for ${BRAND.name}`,
		text: `Confirm your email address to finish setting up ${BRAND.name}:\n\n${appUrl}/verify-email?token=${token}\n\nThe link works for 24 hours. If you did not create an account, ignore this email.`,
	}
}

export function resetPasswordMessage(to: string, appUrl: string, token: string): MailMessage {
	return {
		to,
		subject: `Reset your ${BRAND.name} password`,
		text: `Choose a new password for your ${BRAND.name} account:\n\n${appUrl}/reset-password?token=${token}\n\nThe link works for 60 minutes. If you did not ask for this, ignore this email; your password has not changed.`,
	}
}

/** Short on purpose: stays under 160 characters. */
export function otpMessage(to: string, code: string): SmsMessage {
	return { to, text: `${BRAND.name}: your code is ${code}. It works for 10 minutes. Do not share it.` }
}

/** Tells an applicant what happened to their facility. `text` is the reviewer's reason or question. */
export function facilityDecisionMessage(to: string, facilityName: string, action: 'approve' | 'reject' | 'ask' | 'suspend' | 'reactivate', text: string | null, appUrl: string): MailMessage {
	const link = `${appUrl}/facility`
	const lines: Record<typeof action, [string, string]> = {
		approve: [`${facilityName} is verified on ${BRAND.name}`, `Good news: ${facilityName} is verified. You are now its admin and can add your attendants.`],
		reject: [`We could not verify ${facilityName}`, `We could not verify ${facilityName}.${text ? `\n\nReason: ${text}` : ''}\n\nIf the details were wrong, you can correct them and submit again.`],
		ask: [`A question about ${facilityName}`, `A reviewer has a question about ${facilityName}:\n\n${text ?? ''}\n\nPlease answer in your account so the review can continue.`],
		suspend: [`${facilityName} is suspended`, `${facilityName} is suspended for now. It cannot publish calls or alert donors. Past records stay safe.`],
		reactivate: [`${facilityName} is active again`, `${facilityName} is active again and can publish calls.`],
	}
	return { to, subject: lines[action][0], text: `${lines[action][1]}\n\n${link}` }
}

/** The invitation an admin sends to a colleague. */
export function inviteMessage(to: string, facilityName: string, facilityCode: string, role: 'admin' | 'attendant', invitedBy: string, appUrl: string, token: string, accountExists: boolean): MailMessage {
	const what = role === 'admin' ? 'an admin' : 'an attendant'
	const how = accountExists ? 'You already have an account, so log in and accept the invitation.' : 'You will create a facility account (no donor details are needed).'
	return {
		to,
		subject: `${invitedBy} invited you to ${facilityName} on ${BRAND.name}`,
		text: `${invitedBy} invited you to join ${facilityName} on ${BRAND.name} as ${what}.\n\n${how}\n\n${appUrl}/join-facility?token=${token}\n\nWhen you log in, add the facility code ${facilityCode} to open the facility side. The link works for 14 days.`,
	}
}
