import { randomBytes, randomInt } from 'node:crypto'
import { createAuthToken, createOtp, type Db } from '@damu/db'
import { newId } from './id'
import { sha256 } from './session'

export const VERIFY_EMAIL_TTL_MS = 24 * 3600 * 1000
export const RESET_TTL_MS = 60 * 60 * 1000
export const OTP_TTL_MS = 10 * 60 * 1000

/** Creates a one-use link token (any earlier unused one of that kind is cancelled) and returns the raw token for the email. */
export async function issueLinkToken(db: Db, userId: string, kind: 'verify_email' | 'reset_password', now: Date): Promise<string> {
	const token = randomBytes(32).toString('base64url')
	await createAuthToken(db, { id: newId(now.getTime()), userId, kind, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + (kind === 'verify_email' ? VERIFY_EMAIL_TTL_MS : RESET_TTL_MS)), createdAt: now })
	return token
}

/** The code is hashed together with the user id, so equal codes for two users do not look alike in the table. */
export const otpHash = (userId: string, code: string) => sha256(`${userId}:${code}`)

export async function issueOtp(db: Db, userId: string, phone: string, now: Date, fixed?: string): Promise<string> {
	const code = fixed ?? String(randomInt(0, 1_000_000)).padStart(6, '0')
	await createOtp(db, { id: newId(now.getTime()), userId, phone, codeHash: otpHash(userId, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), createdAt: now })
	return code
}

import type { User } from '@damu/db'
import { hit } from '@damu/db'
import type { AppEnv } from '../app'
import { otpMessage, verifyEmailMessage } from './messages'

export const RESEND_EMAIL_COOLDOWN_MS = 60 * 1000
type Deps = Pick<AppEnv['Variables'], 'db' | 'mailer' | 'sms' | 'config'>

/** Sends the verification email and the phone code right after signup. A sending failure never fails the signup. */
export async function startVerification(d: Deps, user: User, now: Date): Promise<void> {
	await hit(d.db, `resend-email:${user.id}`, RESEND_EMAIL_COOLDOWN_MS, now) // the first email counts toward the resend wait
	try {
		await d.mailer.send(verifyEmailMessage(user.email, d.config.appUrl, await issueLinkToken(d.db, user.id, 'verify_email', now)))
		await d.sms.send(otpMessage(user.phone, await issueOtp(d.db, user.id, user.phone, now, d.config.fixedOtp)))
	} catch (e) {
		console.error('could not send verification messages', e instanceof Error ? e.message : 'unknown error')
	}
}
