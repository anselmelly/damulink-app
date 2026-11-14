import { Hono, type Context } from 'hono'
import {
	bumpOtpAttempts,
	changePhone,
	countOtpsSince,
	findAuthToken,
	findUserByEmail,
	findUserByPhone,
	hit,
	latestOtp,
	markEmailVerified,
	markPhoneVerified,
	revokeAllForUser,
	setPassword,
	useAuthToken,
	useOtp,
} from '@damu/db'
import { forgotInput, phoneSendInput, phoneVerifyInput, resetInput, verifyEmailInput } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { otpMessage, resetPasswordMessage, verifyEmailMessage } from '../lib/messages'
import { hashPassword } from '../lib/password'
import { sha256 } from '../lib/session'
import { parseInput, readJson } from '../lib/validate'
import { issueLinkToken, issueOtp, otpHash, RESEND_EMAIL_COOLDOWN_MS } from '../lib/verification'
import { requireAuth, type AuthEnv } from '../middleware/auth'

const MIN = 60 * 1000
const MAX_WRONG_CODES = 5
const MAX_SENDS_PER_HOUR = 3

export const verificationRoutes = new Hono<AppEnv>()

/** Public: the link in the email lands here. Unknown and used tokens look the same; expired is told apart so the page can offer a fresh link. */
verificationRoutes.post('/verify-email', async (c) => {
	const { db, clock } = c.var
	const { token } = parseInput(verifyEmailInput, await readJson(c))
	const row = await findAuthToken(db, sha256(token), 'verify_email')
	if (!row || row.usedAt) throw new ApiError(400, 'invalid_token', 'This link is not valid.')
	if (row.expiresAt.getTime() <= clock.now().getTime()) throw new ApiError(400, 'token_expired', 'This link has expired. Ask for a new one.')
	if (!(await useAuthToken(db, row.id, clock.now()))) throw new ApiError(400, 'invalid_token', 'This link is not valid.')
	await markEmailVerified(db, row.userId, clock.now())
	return c.json({ ok: true })
})

verificationRoutes.post('/forgot-password', async (c) => {
	const { db, clock, mailer, config } = c.var
	const { email } = parseInput(forgotInput, await readJson(c))
	const now = clock.now()
	const user = await findUserByEmail(db, email)
	// the answer is the same whether or not the account exists; at most 3 mails an hour per address
	if (user && user.status === 'active' && (await hit(db, `forgot:${sha256(email)}`, 60 * MIN, now)) <= 3) {
		try {
			await mailer.send(resetPasswordMessage(user.email, config.appUrl, await issueLinkToken(db, user.id, 'reset_password', now)))
		} catch (e) {
			console.error('could not send reset email', e instanceof Error ? e.message : 'unknown error')
		}
	}
	return c.json({ ok: true })
})

verificationRoutes.post('/reset-password', async (c) => {
	const { db, clock, config } = c.var
	const { token, password } = parseInput(resetInput, await readJson(c)) // a weak password is refused before the link is used up
	const now = clock.now()
	const row = await findAuthToken(db, sha256(token), 'reset_password')
	if (!row || row.usedAt) throw new ApiError(400, 'invalid_token', 'This link is not valid.')
	if (row.expiresAt.getTime() <= now.getTime()) throw new ApiError(400, 'token_expired', 'This link has expired. Ask for a new one.')
	if (!(await useAuthToken(db, row.id, now))) throw new ApiError(400, 'invalid_token', 'This link is not valid.')
	await setPassword(db, row.userId, await hashPassword(password, config.pbkdf2Iterations))
	await revokeAllForUser(db, row.userId, now)
	return c.body(null, 204)
})

verificationRoutes.post('/resend-email', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, mailer, config, user } = c.var
	const now = clock.now()
	if (user.emailVerifiedAt) return c.json({ alreadyVerified: true })
	if ((await hit(db, `resend-email:${user.id}`, RESEND_EMAIL_COOLDOWN_MS, now)) > 1) throw new ApiError(429, 'too_soon', 'Please wait a minute before asking again.')
	await mailer.send(verifyEmailMessage(user.email, config.appUrl, await issueLinkToken(db, user.id, 'verify_email', now)))
	return c.body(null, 204)
})

/** Sends a code to the phone on file, or to a new number (which replaces the old one and resets its verification). */
verificationRoutes.post('/phone/send', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, sms, user } = c.var
	const { phone } = parseInput(phoneSendInput, await readJson(c))
	const now = clock.now()
	const target = phone ?? user.phone
	if (phone && phone !== user.phone) {
		if (await findUserByPhone(db, phone)) throw new ApiError(409, 'phone_taken', 'This number is already registered.', { phone: 'This number is already registered' })
	} else if (user.phoneVerifiedAt) {
		return c.json({ alreadyVerified: true })
	}
	const last = await latestOtp(db, user.id)
	if (last?.lockedUntil && last.lockedUntil.getTime() > now.getTime()) throw new ApiError(429, 'locked', 'Too many wrong codes. Try again later.')
	if (last && now.getTime() - last.createdAt.getTime() < MIN) throw new ApiError(429, 'too_soon', 'Please wait a minute before asking for another code.')
	if ((await countOtpsSince(db, user.id, new Date(now.getTime() - 60 * MIN))) >= MAX_SENDS_PER_HOUR) throw new ApiError(429, 'too_many_sends', 'Too many codes requested. Try again in an hour.')
	if (phone && phone !== user.phone) await changePhone(db, user.id, phone)
	await sms.send(otpMessage(target, await issueOtp(db, user.id, target, now)))
	return c.body(null, 204)
})

verificationRoutes.post('/phone/verify', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { code } = parseInput(phoneVerifyInput, await readJson(c))
	const now = clock.now()
	const otp = await latestOtp(db, user.id)
	const wrong = new ApiError(400, 'wrong_code', 'That code is not right.')
	if (!otp || otp.usedAt || otp.phone !== user.phone) throw wrong
	if (otp.lockedUntil && otp.lockedUntil.getTime() > now.getTime()) throw new ApiError(429, 'locked', 'Too many wrong codes. Try again in 15 minutes.')
	if (otp.expiresAt.getTime() <= now.getTime()) throw new ApiError(400, 'code_expired', 'That code has expired. Ask for a new one.')
	if (otp.codeHash !== otpHash(user.id, code)) {
		await bumpOtpAttempts(db, otp.id, otp.attempts + 1 >= MAX_WRONG_CODES ? new Date(now.getTime() + 15 * MIN) : null)
		throw wrong
	}
	if (!(await useOtp(db, otp.id, now))) throw wrong
	await markPhoneVerified(db, user.id, now)
	return c.json({ ok: true })
})
