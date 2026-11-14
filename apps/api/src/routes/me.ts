import { Hono } from 'hono'
import {
	cancelDonationRequest,
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
import { changePasswordInput, donationRequestInput, newDonorCode, WEEKDAYS, type DonationRequestView } from '@damu/shared-types'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { toMe } from '../lib/me'
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
