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
