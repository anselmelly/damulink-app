import { Hono, type Context } from 'hono'
import { addFacilityEvent, getFacility, getMembership, listMemberFacilities, updateFacility } from '@damu/db'
import { facilityInput, facilityReplyInput } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { myFacilityView } from '../lib/facilities'
import { newId } from '../lib/id'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

export const myFacilityRoutes = new Hono<AppEnv>()

/** Loads a facility the signed-in person belongs to; anyone else gets "not found" so the facility's existence is not revealed. */
async function mine(c: Context<AuthEnv>) {
	const id = c.req.param('id') ?? ''
	const m = await getMembership(c.var.db, id, c.var.user.id)
	const f = m ? await getFacility(c.var.db, id) : undefined
	if (!m || !f) throw new ApiError(404, 'not_found', 'Not found.')
	return { f, role: m.role }
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

/** Correct the details of a rejected facility and send it again. The facility code stays the same. */
myFacilityRoutes.put('/:id', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f, role } = await mine(c)
	const input = parseInput(facilityInput, await readJson(c))
	if (role !== 'admin') throw new ApiError(403, 'not_admin', 'Only the facility admin can change these details.')
	if (f.status !== 'rejected') throw new ApiError(409, 'not_rejected', 'Only a facility that was not approved can be corrected and sent again.')
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
	await addFacilityEvent(db, { id: newId(now.getTime()), facilityId: f.id, actorId: user.id, kind: 'resubmitted', text: input.note || null, visible: false, createdAt: now })
	return c.json(await myFacilityView(db, (await getFacility(db, f.id))!, role))
})
