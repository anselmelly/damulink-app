import { Hono, type Context } from 'hono'
import { acceptInvite, addMember, createUser, findOpenInvite, findUserByEmail, findUserById, findUserByPhone, getFacility, getMembership } from '@damu/db'
import { joinInput, type InviteView } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { myFacilityView } from '../lib/facilities'
import { newId } from '../lib/id'
import { toMe } from '../lib/me'
import { hashPassword } from '../lib/password'
import { issueSession, sha256 } from '../lib/session'
import { parseInput, readJson } from '../lib/validate'
import { startVerification } from '../lib/verification'
import { requireAuth, type AuthEnv } from '../middleware/auth'

export const inviteRoutes = new Hono<AppEnv>()

async function openInvite(c: Context<AppEnv>) {
	const { db, clock } = c.var
	const token = (c.req.param('token') ?? '').slice(0, 100)
	const invite = await findOpenInvite(db, sha256(token), clock.now())
	const facility = invite ? await getFacility(db, invite.facilityId) : undefined
	if (!invite || !facility || facility.status === 'rejected') throw new ApiError(404, 'not_found', 'This invitation is not valid. It may have expired or been used.')
	return { invite, facility }
}

/** Public: what the invitation is for, so the join page can say so. */
inviteRoutes.get('/:token', async (c) => {
	const { invite, facility } = await openInvite(c)
	const inviter = await findUserById(c.var.db, invite.invitedBy)
	const view: InviteView = { facilityName: facility.name, town: facility.town, email: invite.email, role: invite.role, invitedBy: inviter?.name ?? null, accountExists: !!(await findUserByEmail(c.var.db, invite.email)) }
	return c.json(view)
})

/** A new person joins from the invite: no donor details, and the email is already confirmed because the link came to it. */
inviteRoutes.post('/:token/join', async (c) => {
	const { db, clock, config } = c.var
	const { invite, facility } = await openInvite(c)
	const input = parseInput(joinInput, await readJson(c))
	if (await findUserByEmail(db, invite.email)) throw new ApiError(409, 'account_exists', 'You already have an account. Log in to accept the invitation.')
	if (await findUserByPhone(db, input.phone)) throw new ApiError(409, 'phone_taken', 'An account with this phone number already exists.', { phone: 'This number is already registered' })
	const now = clock.now()
	const id = newId(now.getTime())
	try {
		await createUser(db, { id, name: input.name, email: invite.email, emailVerifiedAt: now, phone: input.phone, passwordHash: await hashPassword(input.password, config.pbkdf2Iterations), smsOptIn: false, createdAt: now }, [], null)
	} catch (e: any) {
		if (e?.cause?.code === 'ER_DUP_ENTRY' || e?.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'duplicate', 'An account with these details already exists.')
		throw e
	}
	await addMember(db, { facilityId: facility.id, userId: id, role: invite.role, roleTitle: null, createdAt: now })
	await acceptInvite(db, invite.id, now)
	const user = (await findUserById(db, id))!
	await startVerification(c.var, user, now, { skipEmail: true })
	const session = await issueSession(db, config.jwtSecret, user, now, { userAgent: c.req.header('User-Agent') })
	return c.json({ ...session, user: await toMe(db, user, now), facility: await myFacilityView(db, facility, invite.role) }, 201)
})

/** Someone who already has an account accepts: the signed-in email must be the one invited. */
inviteRoutes.post('/:token/accept', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { invite, facility } = await openInvite(c as unknown as Context<AppEnv>)
	if (invite.email.toLowerCase() !== user.email.toLowerCase()) throw new ApiError(403, 'wrong_account', 'This invitation was sent to a different email address.')
	const now = clock.now()
	const already = await getMembership(db, facility.id, user.id)
	await addMember(db, { facilityId: facility.id, userId: user.id, role: already?.role === 'admin' ? 'admin' : invite.role, roleTitle: already?.roleTitle ?? null, createdAt: now })
	await acceptInvite(db, invite.id, now)
	return c.json(await myFacilityView(db, facility, (await getMembership(db, facility.id, user.id))!.role))
})
