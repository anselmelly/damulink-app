import { Hono } from 'hono'
import { createFacility, createUser, findUserByEmail, findUserById, findUserByPhone, getFacility } from '@damu/db'
import { registerFacilityInput } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { myFacilityView, uniqueFacilityCode, uniqueSlug } from '../lib/facilities'
import { newId } from '../lib/id'
import { toMe } from '../lib/me'
import { hashPassword } from '../lib/password'
import { issueSession } from '../lib/session'
import { parseInput, readJson } from '../lib/validate'
import { startVerification } from '../lib/verification'

export const facilitySignupRoutes = new Hono<AppEnv>()

/**
 * Registering a facility when you are not a donor: a person without donor details, and an incomplete facility they run.
 * They verify email and phone, then complete the facility profile (PUT /api/my-facilities/:id) to send it for review.
 */
facilitySignupRoutes.post('/register-facility', async (c) => {
	const { db, clock, config } = c.var
	const input = parseInput(registerFacilityInput, await readJson(c))
	const now = clock.now()
	if (await findUserByEmail(db, input.email)) throw new ApiError(409, 'email_taken', 'An account with this email already exists.', { email: 'This email is already registered' })
	if (await findUserByPhone(db, input.phone)) throw new ApiError(409, 'phone_taken', 'An account with this phone number already exists.', { phone: 'This number is already registered' })
	const userId = newId(now.getTime())
	const facilityId = newId(now.getTime())
	try {
		await createUser(db, { id: userId, name: input.name, email: input.email, phone: input.phone, passwordHash: await hashPassword(input.password, config.pbkdf2Iterations), smsOptIn: false, createdAt: now }, [], null)
		await createFacility(
			db,
			{ id: facilityId, name: input.facilityName, type: input.facilityType, town: input.town, county: input.county, status: 'incomplete', facilityCode: await uniqueFacilityCode(db), slug: await uniqueSlug(db, input.facilityName, input.town), createdBy: userId },
			{ userId, roleTitle: '', at: now },
			// no event yet: the application starts when the profile is completed
			null,
		)
	} catch (e: any) {
		if (e?.cause?.code === 'ER_DUP_ENTRY' || e?.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'duplicate', 'An account with these details already exists.')
		throw e
	}
	const user = (await findUserById(db, userId))!
	await startVerification(c.var, user, now)
	const session = await issueSession(db, config.jwtSecret, user, now, { userAgent: c.req.header('User-Agent') })
	return c.json({ ...session, user: await toMe(db, user, now), facility: await myFacilityView(db, (await getFacility(db, facilityId))!, 'admin') }, 201)
})
