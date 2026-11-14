import { Hono, type Context } from 'hono'
import {
	addFacilityEvent,
	countAdmins,
	createInvite,
	donorStats,
	findUserByEmail,
	getFacility,
	getMembership,
	listMemberFacilities,
	listMembers,
	listOpenInvites,
	removeMember,
	revokeInvite,
	setMemberRole,
	setMemberTitle,
	updateFacility,
	type Facility,
} from '@damu/db'
import { facilityInput, facilityProfileInput, facilityReplyInput, inviteInput, roleInput, type MemberView } from '@damu/shared-types'
import { randomBytes } from 'node:crypto'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { myFacilityView } from '../lib/facilities'
import { newId } from '../lib/id'
import { inviteMessage } from '../lib/messages'
import { sha256 } from '../lib/session'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

export const myFacilityRoutes = new Hono<AppEnv>()
export const INVITE_TTL_MS = 14 * 24 * 3600 * 1000
/** A pin that moves less than this (about 55 metres) is rounding, not a move. */
const PIN_TOLERANCE = 0.0005

/** Loads a facility the signed-in person belongs to; anyone else gets "not found" so the facility's existence is not revealed. */
async function mine(c: Context<AuthEnv>) {
	const id = c.req.param('id') ?? ''
	const m = await getMembership(c.var.db, id, c.var.user.id)
	const f = m ? await getFacility(c.var.db, id) : undefined
	if (!m || !f) throw new ApiError(404, 'not_found', 'Not found.')
	return { f, role: m.role }
}
async function mineAsAdmin(c: Context<AuthEnv>) {
	const r = await mine(c)
	if (r.role !== 'admin') throw new ApiError(403, 'not_admin', 'Only the facility admin can do this.')
	return r
}

myFacilityRoutes.get('/', requireAuth, async (c: Context<AuthEnv>) => {
	const rows = await listMemberFacilities(c.var.db, c.var.user.id)
	return c.json(await Promise.all(rows.map(({ f, role }) => myFacilityView(c.var.db, f, role))))
})

myFacilityRoutes.get('/:id', requireAuth, async (c: Context<AuthEnv>) => {
	const { f, role } = await mine(c)
	return c.json(await myFacilityView(c.var.db, f, role))
})

/** Answer a reviewer's question; the application goes back into the queue. */
myFacilityRoutes.post('/:id/reply', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f, role } = await mine(c)
	const { text } = parseInput(facilityReplyInput, await readJson(c))
	if (f.status !== 'needs_info') throw new ApiError(409, 'not_waiting', 'The reviewer has no open question for you.')
	const now = clock.now()
	await addFacilityEvent(db, { id: newId(now.getTime()), facilityId: f.id, actorId: user.id, kind: 'reply', text, visible: true, createdAt: now })
	await updateFacility(db, f.id, { status: 'pending' })
	return c.json(await myFacilityView(db, (await getFacility(db, f.id))!, role))
})

/**
 * Complete a facility that signed up with only the basics (needs a verified email), or correct a rejected one and send it again.
 * Either way it goes to the review queue; the facility code stays the same.
 */
myFacilityRoutes.put('/:id', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f } = await mineAsAdmin(c)
	const input = parseInput(facilityInput, await readJson(c))
	if (f.status !== 'rejected' && f.status !== 'incomplete') throw new ApiError(409, 'not_rejected', 'Only a facility that is incomplete or was not approved can be sent for review this way.')
	if (f.status === 'incomplete' && !user.emailVerifiedAt) throw new ApiError(403, 'email_not_verified', 'Verify your email before sending your facility for review.')
	const now = clock.now()
	await updateFacility(db, f.id, {
		name: input.name,
		type: input.type,
		town: input.town,
		county: input.county,
		licenseNumber: input.licenseNumber,
		owner: input.owner || null,
		address: input.address || null,
		lat: input.lat,
		lng: input.lng,
		phone: input.phone,
		email: input.email,
		status: 'pending',
		submittedAt: now,
	})
	await setMemberTitle(db, f.id, user.id, input.role)
	await addFacilityEvent(db, { id: newId(now.getTime()), facilityId: f.id, actorId: user.id, kind: f.status === 'incomplete' ? 'submitted' : 'resubmitted', text: input.note || null, visible: false, createdAt: now })
	return c.json(await myFacilityView(db, (await getFacility(db, f.id))!, 'admin'))
})

/** Change the details of a verified facility. A moved pin sends it back for review; the license number cannot be changed here. */
myFacilityRoutes.patch('/:id/profile', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f } = await mineAsAdmin(c)
	const input = parseInput(facilityProfileInput, await readJson(c))
	if (f.status !== 'verified') throw new ApiError(409, 'not_verified', 'You can edit details here once the facility is verified.')
	const now = clock.now()
	const changes: Partial<Facility> = {}
	for (const k of ['name', 'type', 'town', 'county'] as const) if (input[k] !== undefined) changes[k] = input[k] as never
	if (input.owner !== undefined) changes.owner = input.owner || null
	if (input.address !== undefined) changes.address = input.address || null
	if (input.phone !== undefined) changes.phone = input.phone
	if (input.email !== undefined) changes.email = input.email
	const moved = (input.lat !== undefined && Math.abs(input.lat - (f.lat ?? 0)) > PIN_TOLERANCE) || (input.lng !== undefined && Math.abs(input.lng - (f.lng ?? 0)) > PIN_TOLERANCE)
	if (moved) {
		changes.lat = input.lat ?? f.lat
		changes.lng = input.lng ?? f.lng
		changes.status = 'pending'
		changes.submittedAt = now
		await addFacilityEvent(db, { id: newId(now.getTime()), facilityId: f.id, actorId: user.id, kind: 'resubmitted', text: 'The GPS pin was moved. A reviewer will confirm the new location before the facility is verified again.', visible: true, createdAt: now })
	}
	if (Object.keys(changes).length) await updateFacility(db, f.id, changes)
	return c.json(await myFacilityView(db, (await getFacility(db, f.id))!, 'admin'))
})

/** Donor numbers for the facility admin. */
myFacilityRoutes.get('/:id/stats', requireAuth, async (c: Context<AuthEnv>) => {
	const { f } = await mineAsAdmin(c)
	return c.json(await donorStats(c.var.db, f.id))
})

// ---------- the team
myFacilityRoutes.get('/:id/members', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f } = await mineAsAdmin(c)
	const people = await listMembers(db, f.id)
	const invites = await listOpenInvites(db, f.id, clock.now())
	const rows: MemberView[] = [
		...people.map((p) => ({ userId: p.userId, inviteId: null, name: p.name, email: p.email, role: p.role, status: 'active' as const, isMe: p.userId === user.id, since: p.since.toISOString() })),
		...invites.map((i) => ({ userId: null, inviteId: i.id, name: null, email: i.email, role: i.role, status: 'invited' as const, isMe: false, since: i.createdAt.toISOString() })),
	]
	return c.json(rows)
})

/** Invite someone by email. Asking again for the same person sends a fresh link and cancels the old one. */
myFacilityRoutes.post('/:id/attendants', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, mailer, config, user } = c.var
	const { f } = await mineAsAdmin(c)
	const input = parseInput(inviteInput, await readJson(c))
	if (f.status !== 'verified') throw new ApiError(409, 'not_verified', 'You can add attendants once the facility is verified.')
	const existing = await findUserByEmail(db, input.email)
	if (existing && (await getMembership(db, f.id, existing.id))) throw new ApiError(409, 'already_member', 'This person already works at the facility.')
	const now = clock.now()
	const token = randomBytes(32).toString('base64url')
	await createInvite(db, { id: newId(now.getTime()), facilityId: f.id, email: input.email, role: input.role, tokenHash: sha256(token), invitedBy: user.id, createdAt: now, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) })
	try {
		await mailer.send(inviteMessage(input.email, f.name, f.facilityCode ?? '', input.role, user.name, config.appUrl, token, !!existing))
	} catch (e) {
		console.error('could not send the invitation', e instanceof Error ? e.message : 'unknown error')
	}
	return c.body(null, 201)
})

myFacilityRoutes.patch('/:id/members/:userId', requireAuth, async (c: Context<AuthEnv>) => {
	const { db } = c.var
	const { f } = await mineAsAdmin(c)
	const { role } = parseInput(roleInput, await readJson(c))
	const userId = c.req.param('userId') ?? ''
	const m = await getMembership(db, f.id, userId)
	if (!m) throw new ApiError(404, 'not_found', 'Not found.')
	if (m.role === 'admin' && role === 'attendant' && (await countAdmins(db, f.id)) <= 1) throw new ApiError(409, 'last_admin', 'A facility always keeps at least one admin.')
	await setMemberRole(db, f.id, userId, role)
	return c.body(null, 200)
})

myFacilityRoutes.delete('/:id/members/:userId', requireAuth, async (c: Context<AuthEnv>) => {
	const { db } = c.var
	const { f } = await mineAsAdmin(c)
	const userId = c.req.param('userId') ?? ''
	const m = await getMembership(db, f.id, userId)
	if (!m) throw new ApiError(404, 'not_found', 'Not found.')
	if (m.role === 'admin' && (await countAdmins(db, f.id)) <= 1) throw new ApiError(409, 'last_admin', 'A facility always keeps at least one admin.')
	await removeMember(db, f.id, userId)
	return c.body(null, 204)
})

myFacilityRoutes.delete('/:id/invites/:inviteId', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock } = c.var
	const { f } = await mineAsAdmin(c)
	if (!(await revokeInvite(db, c.req.param('inviteId') ?? '', f.id, clock.now()))) throw new ApiError(404, 'not_found', 'Not found.')
	return c.body(null, 204)
})

