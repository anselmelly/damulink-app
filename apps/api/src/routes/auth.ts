import { Hono } from 'hono'
import {
	createUser,
	donorCodeExists,
	facilityExists,
	findRefreshByHash,
	findUserByEmail,
	findUserById,
	findUserByPhone,
	hit,
	markRefreshUsed,
	peek,
	reset,
	revokeAllForUser,
	revokeFamily,
	touchLogin,
} from '@damu/db'
import { eq } from 'drizzle-orm'
import { users } from '@damu/db'
import { loginInput, newDonorCode, refreshInput, signupInput } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { isAdult, toMe } from '../lib/me'
import { hashPassword, verifyPassword } from '../lib/password'
import { issueSession, sha256 } from '../lib/session'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
// A real hash of a throwaway password, so an unknown email costs the same time as a wrong password.
let dummyHash: Promise<string> | undefined

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/signup', async (c) => {
	const { db, clock, config } = c.var
	const input = parseInput(signupInput, await readJson(c))
	const now = clock.now()

	const dob = new Date(`${input.dateOfBirth}T00:00:00Z`)
	if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== input.dateOfBirth || dob > now || dob.getUTCFullYear() < 1900) {
		throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { dateOfBirth: 'Enter a real date of birth' })
	}
	for (const id of [input.homeFacilityId, ...input.extraFacilityIds].filter((x): x is string => !!x)) {
		if (!(await facilityExists(db, id))) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { [id === input.homeFacilityId ? 'homeFacilityId' : 'extraFacilityIds']: 'Choose a facility from the list' })
	}
	if (await findUserByEmail(db, input.email)) throw new ApiError(409, 'email_taken', 'An account with this email already exists.', { email: 'This email is already registered' })
	if (await findUserByPhone(db, input.phone)) throw new ApiError(409, 'phone_taken', 'An account with this phone number already exists.', { phone: 'This number is already registered' })

	const adult = isAdult(input.dateOfBirth, now)
	let donorCode: string | null = null
	if (adult) {
		do donorCode = newDonorCode()
		while (await donorCodeExists(db, donorCode))
	}
	const id = newId(now.getTime())
	try {
		await createUser(
			db,
			{
				id,
				name: input.name,
				email: input.email,
				phone: input.phone,
				passwordHash: await hashPassword(input.password, config.pbkdf2Iterations),
				sex: input.sex,
				dateOfBirth: input.dateOfBirth,
				donorCode,
				homeFacilityId: input.homeFacilityId ?? null,
				unlistedFacilityName: input.unlistedFacilityName ?? null,
				smsOptIn: input.smsOptIn,
				createdAt: now,
			},
			input.extraFacilityIds,
			input.unlistedFacilityName ? { id: newId(now.getTime()), name: input.unlistedFacilityName } : null,
		)
	} catch (e: any) {
		// two signups racing on the same email or phone: the unique index decides
		if (e?.cause?.code === 'ER_DUP_ENTRY' || e?.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'duplicate', 'An account with these details already exists.')
		throw e
	}
	const user = (await findUserById(db, id))!
	const session = await issueSession(db, config.jwtSecret, user, now, { userAgent: c.req.header('User-Agent') })
	return c.json({ ...session, user: await toMe(db, user, adult) }, 201)
})

authRoutes.post('/login', async (c) => {
	const { db, clock, config } = c.var
	const input = parseInput(loginInput, await readJson(c))
	const now = clock.now()
	const key = `login:email:${sha256(input.email)}`

	if ((await peek(db, key, LOGIN_WINDOW_MS, now)) >= LOGIN_MAX_FAILURES) throw new ApiError(429, 'too_many_attempts', 'Too many attempts. Try again in a few minutes.')

	const user = await findUserByEmail(db, input.email)
	dummyHash ??= hashPassword('not-a-real-password', config.pbkdf2Iterations)
	const ok = await verifyPassword(input.password, user ? user.passwordHash : await dummyHash)
	if (!user || !ok) {
		await hit(db, key, LOGIN_WINDOW_MS, now)
		throw new ApiError(401, 'invalid_credentials', 'Email or password is not right.')
	}
	if (user.status !== 'active') throw new ApiError(403, 'suspended', 'This account is suspended.')

	await reset(db, key)
	await touchLogin(db, user.id, now)
	const session = await issueSession(db, config.jwtSecret, user, now, { userAgent: c.req.header('User-Agent') })
	return c.json({ ...session, user: await toMe(db, user, !!user.donorCode) })
})

authRoutes.post('/refresh', async (c) => {
	const { db, clock, config } = c.var
	const { refreshToken } = parseInput(refreshInput, await readJson(c))
	const now = clock.now()
	const row = await findRefreshByHash(db, sha256(refreshToken))
	const invalid = new ApiError(401, 'invalid_refresh', 'Please log in again.')
	if (!row) throw invalid
	// a token that was already used (or revoked) coming back is a replay: kill the whole family
	if (row.usedAt || row.revokedAt) {
		await revokeFamily(db, row.familyId, now)
		throw invalid
	}
	if (row.expiresAt.getTime() <= now.getTime()) throw invalid
	if (!(await markRefreshUsed(db, row.id, now))) {
		await revokeFamily(db, row.familyId, now)
		throw invalid
	}
	const user = await findUserById(db, row.userId)
	if (!user) throw invalid
	if (user.status !== 'active') throw new ApiError(403, 'suspended', 'This account is suspended.')
	return c.json(await issueSession(db, config.jwtSecret, user, now, { familyId: row.familyId, userAgent: c.req.header('User-Agent') }))
})

authRoutes.post('/logout', async (c) => {
	const { db, clock } = c.var
	const { refreshToken } = parseInput(refreshInput, await readJson(c))
	const row = await findRefreshByHash(db, sha256(refreshToken))
	if (row) await revokeFamily(db, row.familyId, clock.now())
	return c.body(null, 204)
})

const authed = new Hono<AuthEnv>()
authed.use('*', requireAuth)
/** Ends every session: bumps token_version (so live access tokens die at once) and revokes all refresh tokens. */
authed.post('/logout-all', async (c) => {
	const { db, clock, user } = c.var
	await db.update(users).set({ tokenVersion: user.tokenVersion + 1 }).where(eq(users.id, user.id))
	await revokeAllForUser(db, user.id, clock.now())
	return c.body(null, 204)
})
authRoutes.route('/', authed as unknown as Hono<AppEnv>)
