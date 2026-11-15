import { Hono } from 'hono'
import {
	askReschedule,
	cancelDonationRequest,
	deleteAccount,
	facilityExists,
	findUserByEmail,
	getPrefs,
	insertFacilityRequest,
	replaceFacilities,
	savePrefs,
	updateUser,
	writeAudit,
	donorCodeExists,
	findDonationRequest,
	findUserById,
	hasOpenDonationRequest,
	hit,
	insertDonationRequest,
	listDonationRequests,
	peek,
	reset,
	revokeAllForUser,
	setDonorCode,
	setPassword,
	userFacilities,
	type DonationRequestRow,
} from '@damu/db'
import {
	alertPrefsInput,
	changePasswordInput,
	deleteAccountInput,
	donationRequestInput,
	facilitiesInput,
	facilityRequestInput,
	newDonorCode,
	profileInput,
	reminderPrefsInput,
	WEEKDAYS,
	type AlertPrefs,
	type DonationRequestView,
	type ReminderPrefs,
} from '@damu/shared-types'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { getEligibilitySettings } from '../lib/eligibility'
import { badBirthDate, isAdult, toMe } from '../lib/me'
import { getAlertLimits, pauseUntil } from '../lib/prefs'
import { issueLinkToken } from '../lib/verification'
import { verifyEmailMessage } from '../lib/messages'
import { hashPassword, verifyPassword } from '../lib/password'
import { issueSession } from '../lib/session'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

export const meRoutes = new Hono<AuthEnv>()
meRoutes.use('*', requireAuth)

meRoutes.get('/', async (c) => c.json(await toMe(c.var.db, c.var.user, c.var.clock.now())))

/** Change the password while signed in. Every old session dies; the answer carries a fresh pair for this one. */
meRoutes.post('/password', async (c) => {
	const { db, clock, config, user } = c.var
	const { currentPassword, newPassword } = parseInput(changePasswordInput, await readJson(c))
	const now = clock.now()
	const key = `pwchange:${user.id}`
	if ((await peek(db, key, 15 * 60 * 1000, now)) >= 5) throw new ApiError(429, 'too_many_attempts', 'Too many attempts. Try again in a few minutes.')
	if (!(await verifyPassword(currentPassword, user.passwordHash))) {
		await hit(db, key, 15 * 60 * 1000, now)
		throw new ApiError(403, 'wrong_password', 'Your current password is not right.', { currentPassword: 'Not right' })
	}
	await reset(db, key)
	await setPassword(db, user.id, await hashPassword(newPassword, config.pbkdf2Iterations))
	await revokeAllForUser(db, user.id, now)
	const fresh = (await findUserById(db, user.id))!
	return c.json(await issueSession(db, config.jwtSecret, fresh, now, { userAgent: c.req.header('User-Agent') }))
})

/** A new donor code: the old one stops existing at once. Three a day at most. */
meRoutes.post('/donor-code/regenerate', async (c) => {
	const { db, clock, user } = c.var
	if (!user.donorCode) throw new ApiError(403, 'not_a_donor', 'Donor codes are for donors aged 18 and over.')
	if ((await hit(db, `donor-code:${user.id}`, 24 * 3600 * 1000, clock.now())) > 3) throw new ApiError(429, 'too_many_codes', 'You have made enough new codes for today. Try again tomorrow.')
	let code: string
	do code = newDonorCode()
	while ((await donorCodeExists(db, code)) || code === user.donorCode)
	await setDonorCode(db, user.id, code)
	return c.json({ donorCode: code })
})

const view = ({ r, facilityName }: { r: DonationRequestRow; facilityName: string }): DonationRequestView => ({
	id: r.id,
	kind: r.kind,
	facilityId: r.facilityId,
	facilityName,
	days: r.days.split(','),
	timeOfDay: r.timeOfDay,
	status: r.status,
	scheduledAt: r.scheduledAt?.toISOString() ?? null,
	createdAt: r.createdAt.toISOString(),
	rescheduleAsked: r.rescheduleAsked,
	cancelledBy: r.cancelledBy,
	cancelReason: r.cancelReason,
	cancelNote: r.cancelNote,
})

/** Ask a facility for a blood type test or a donation. The facility approves it and sets a date (a later phase). */
meRoutes.post('/donation-requests', async (c) => {
	const { db, clock, user } = c.var
	const input = parseInput(donationRequestInput, await readJson(c))
	if (!user.donorCode) throw new ApiError(403, 'not_a_donor', 'You can ask to donate from your 18th birthday.')
	if (!user.phoneVerifiedAt) throw new ApiError(403, 'phone_not_verified', 'Verify your phone first.')
	const mine = await userFacilities(db, user)
	if (!mine.some((f) => f.id === input.facilityId)) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { facilityId: 'Choose one of your facilities' })
	if (input.kind === 'test' && user.bloodType) throw new ApiError(422, 'already_verified', 'Your blood type is already recorded, so you do not need a test.')
	if (await hasOpenDonationRequest(db, user.id)) throw new ApiError(409, 'already_requested', 'You already have a request open. Cancel it first to ask again.')
	const now = clock.now()
	const id = newId(now.getTime())
	const days = WEEKDAYS.filter((d) => input.days.includes(d)).join(',')
	await insertDonationRequest(db, { id, userId: user.id, facilityId: input.facilityId, kind: input.kind, days, timeOfDay: input.timeOfDay, status: 'requested', createdAt: now, updatedAt: now })
	return c.json(view((await findDonationRequest(db, id, user.id))!), 201)
})

meRoutes.get('/donation-requests', async (c) => c.json((await listDonationRequests(c.var.db, c.var.user.id)).map(view)))

meRoutes.post('/donation-requests/:id/cancel', async (c) => {
	const { db, clock, user } = c.var
	const id = c.req.param('id')
	if (!(await findDonationRequest(db, id, user.id))) throw new ApiError(404, 'not_found', 'Not found.')
	if (!(await cancelDonationRequest(db, id, user.id, clock.now()))) throw new ApiError(409, 'not_cancellable', 'This request can no longer be cancelled.')
	return c.json(view((await findDonationRequest(db, id, user.id))!))
})

/** The donor asks the facility to move a booked visit; it then shows up in the facility's follow-up list. */
meRoutes.post('/donation-requests/:id/reschedule', async (c) => {
	const { db, clock, user } = c.var
	const id = c.req.param('id')
	if (!(await findDonationRequest(db, id, user.id))) throw new ApiError(404, 'not_found', 'Not found.')
	if (!(await askReschedule(db, id, user.id, clock.now()))) throw new ApiError(409, 'not_bookable', 'Only a booked visit can be moved.')
	return c.json(view((await findDonationRequest(db, id, user.id))!))
})

/** Change name, email, sex or date of birth. A new email must be verified again; crossing 18 gives or takes away the donor code. */
meRoutes.patch('/', async (c) => {
	const { db, clock, mailer, config, user } = c.var
	const input = parseInput(profileInput, await readJson(c))
	const now = clock.now()
	const changes: Parameters<typeof updateUser>[2] = {}
	if (input.name !== undefined) changes.name = input.name
	if (input.sex !== undefined) changes.sex = input.sex
	if (input.dateOfBirth !== undefined && input.dateOfBirth !== user.dateOfBirth) {
		const bad = badBirthDate(input.dateOfBirth, now)
		if (bad) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { dateOfBirth: bad })
		changes.dateOfBirth = input.dateOfBirth
		const adult = isAdult(input.dateOfBirth, now)
		if (adult && !user.donorCode) {
			let code: string
			do code = newDonorCode()
			while (await donorCodeExists(db, code))
			changes.donorCode = code
		} else if (!adult && user.donorCode) changes.donorCode = null
	}
	const emailChanged = input.email !== undefined && input.email !== user.email
	if (emailChanged) {
		if (await findUserByEmail(db, input.email!)) throw new ApiError(409, 'email_taken', 'An account with this email already exists.', { email: 'This email is already registered' })
		changes.email = input.email
		changes.emailVerifiedAt = null
	}
	await updateUser(db, user.id, changes)
	const fresh = (await findUserById(db, user.id))!
	if (emailChanged) {
		try {
			await mailer.send(verifyEmailMessage(fresh.email, config.appUrl, await issueLinkToken(db, user.id, 'verify_email', now)))
		} catch (e) {
			console.error('could not send verification email', e instanceof Error ? e.message : 'unknown error')
		}
	}
	return c.json(await toMe(db, fresh, now))
})

/** Replace the home facility and the extra ones. Only verified facilities; at most 5 extras. */
meRoutes.put('/facilities', async (c) => {
	const { db, clock, user } = c.var
	const { homeFacilityId, extraFacilityIds } = parseInput(facilitiesInput, await readJson(c))
	const invalid = (fields: Record<string, string>) => new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', fields)
	if (homeFacilityId && extraFacilityIds.includes(homeFacilityId)) throw invalid({ extraFacilityIds: 'Your home facility is already your home facility' })
	for (const id of new Set([...(homeFacilityId ? [homeFacilityId] : []), ...extraFacilityIds])) {
		if (!(await facilityExists(db, id))) throw invalid({ [id === homeFacilityId ? 'homeFacilityId' : 'extraFacilityIds']: 'Choose a facility from the list' })
	}
	await replaceFacilities(db, user.id, homeFacilityId, [...new Set(extraFacilityIds)])
	return c.json(await toMe(db, (await findUserById(db, user.id))!, clock.now()))
})

/** "My facility is not listed": kept as a list for the super admin. */
meRoutes.post('/facility-requests', async (c) => {
	const { db, clock, user } = c.var
	const input = parseInput(facilityRequestInput, await readJson(c))
	const now = clock.now()
	if ((await hit(db, `facility-request:${user.id}`, 24 * 3600 * 1000, now)) > 5) throw new ApiError(429, 'too_many_requests', 'You have sent enough for today. Try again tomorrow.')
	await insertFacilityRequest(db, { id: newId(now.getTime()), name: input.name, town: input.town, county: input.county || null, userId: user.id, createdAt: now })
	return c.body(null, 201)
})

/** Delete the account. Needs the password. The audit log keeps one line with the id only. */
meRoutes.delete('/', async (c) => {
	const { db, clock, user } = c.var
	const { password } = parseInput(deleteAccountInput, await readJson(c))
	const now = clock.now()
	const key = `pwchange:${user.id}`
	if ((await peek(db, key, 15 * 60 * 1000, now)) >= 5) throw new ApiError(429, 'too_many_attempts', 'Too many attempts. Try again in a few minutes.')
	if (!(await verifyPassword(password, user.passwordHash))) {
		await hit(db, key, 15 * 60 * 1000, now)
		throw new ApiError(403, 'wrong_password', 'Your password is not right.', { password: 'Not right' })
	}
	await deleteAccount(db, user.id)
	await writeAudit(db, { action: 'account_deleted', target: user.id }, now)
	return c.body(null, 204)
})

async function alertView(c: { var: AuthEnv['Variables'] }): Promise<AlertPrefs> {
	const { db, user } = c.var
	const [p, limits] = [await getPrefs(db, user.id), await getAlertLimits(db)]
	return {
		smsAlerts: p ? p.smsAlerts : user.smsOptIn,
		emailAlerts: p?.emailAlerts ?? false,
		available: p?.available ?? true,
		pausedUntil: p?.pausedUntil?.toISOString() ?? null,
		weeklyCap: p?.weeklyCap ?? limits.weeklyCap,
		quietFrom: p?.quietFrom ?? limits.quietFrom,
		quietTo: p?.quietTo ?? limits.quietTo,
		defaults: limits,
	}
}
meRoutes.get('/alerts', async (c) => c.json(await alertView(c)))

meRoutes.put('/alerts', async (c) => {
	const { db, clock, user } = c.var
	const input = parseInput(alertPrefsInput, await readJson(c))
	const limits = await getAlertLimits(db)
	const fields: Record<string, string> = {}
	// a donor can only make these stricter than the system limits
	if (input.weeklyCap > limits.weeklyCap) fields.weeklyCap = `At most ${limits.weeklyCap} a week`
	if (input.quietFrom > limits.quietFrom) fields.quietFrom = `Quiet hours cannot start later than ${limits.quietFrom}:00`
	if (input.quietTo < limits.quietTo) fields.quietTo = `Quiet hours cannot end earlier than ${limits.quietTo}:00`
	if (Object.keys(fields).length) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', fields)
	if (input.emailAlerts && !user.emailVerifiedAt) throw new ApiError(422, 'email_not_verified', 'Verify your email to get email alerts.', { emailAlerts: 'Verify your email first' })
	const now = clock.now()
	const before = await getPrefs(db, user.id)
	const pausedUntil = input.pause === 'keep' ? (before?.pausedUntil ?? null) : input.pause === 'none' ? null : pauseUntil(input.pause, now)
	await savePrefs(db, { userId: user.id, smsAlerts: input.smsAlerts, emailAlerts: input.emailAlerts, available: input.available, pausedUntil, weeklyCap: input.weeklyCap, quietFrom: input.quietFrom, quietTo: input.quietTo, updatedAt: now })
	return c.json(await alertView(c))
})

async function reminderView(c: { var: AuthEnv['Variables'] }): Promise<ReminderPrefs> {
	const { db, user } = c.var
	const [p, e] = [await getPrefs(db, user.id), await getEligibilitySettings(db)]
	return {
		cycle: p?.reminderCycle ?? 'on_day',
		daysBefore: p?.reminderDaysBefore ?? 3,
		cycleMonths: p?.reminderCycleMonths ?? null,
		appointmentReminders: p?.appointmentReminders ?? true,
		minMonths: user.sex === 'male' ? e.waitingMonthsMale : e.waitingMonthsFemale // no sex on file: the longer wait,
	}
}
meRoutes.get('/reminders', async (c) => c.json(await reminderView(c)))

meRoutes.put('/reminders', async (c) => {
	const { db, clock, user } = c.var
	const input = parseInput(reminderPrefsInput, await readJson(c))
	const { minMonths } = await reminderView(c)
	if (input.cycle === 'custom') {
		if (input.cycleMonths == null) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { cycleMonths: 'Choose how many months' })
		if (input.cycleMonths < minMonths) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { cycleMonths: `Not shorter than your waiting period of ${minMonths} months` })
	}
	await savePrefs(db, {
		userId: user.id,
		smsAlerts: (await getPrefs(db, user.id))?.smsAlerts ?? user.smsOptIn,
		reminderCycle: input.cycle,
		reminderDaysBefore: input.daysBefore,
		reminderCycleMonths: input.cycle === 'custom' ? input.cycleMonths : null,
		appointmentReminders: input.appointmentReminders,
		updatedAt: clock.now(),
	})
	return c.json(await reminderView(c))
})
