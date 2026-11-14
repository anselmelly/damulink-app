import { Hono, type Context } from 'hono'
import { createFacility, getFacility, getVerifiedBySlug, hit, searchFacilities } from '@damu/db'
import { facilityInput } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { myFacilityView, uniqueFacilityCode, uniqueSlug } from '../lib/facilities'
import { newId } from '../lib/id'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

export const facilityRoutes = new Hono<AppEnv>()

/** Public: verified facilities by name or town, at most 20. */
facilityRoutes.get('/', async (c) => c.json(await searchFacilities(c.var.db, (c.req.query('q') ?? '').slice(0, 100))))

/** Public: the facility behind an invite link (verified facilities only). */
facilityRoutes.get('/by-slug/:slug', async (c) => {
	const f = await getVerifiedBySlug(c.var.db, c.req.param('slug').toLowerCase().slice(0, 80))
	if (!f) throw new ApiError(404, 'not_found', 'Not found.')
	return c.json(f)
})

/** Add a facility. It starts Pending; the person who adds it becomes its admin and a reviewer checks it by hand. */
facilityRoutes.post('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const input = parseInput(facilityInput, await readJson(c))
	if (!user.emailVerifiedAt) throw new ApiError(403, 'email_not_verified', 'Verify your email before adding a facility.')
	const now = clock.now()
	if ((await hit(db, `facility-add:${user.id}`, 24 * 3600 * 1000, now)) > 3) throw new ApiError(429, 'too_many_requests', 'You have submitted enough facilities for today. Try again tomorrow.')
	const id = newId(now.getTime())
	const code = await uniqueFacilityCode(db)
	await createFacility(
		db,
		{
			id,
			name: input.name,
			type: input.type,
			town: input.town,
			county: input.county,
			status: 'pending',
			licenseNumber: input.licenseNumber,
			owner: input.owner || null,
			address: input.address || null,
			lat: input.lat,
			lng: input.lng,
			phone: input.phone,
			email: input.email,
			facilityCode: code,
			slug: await uniqueSlug(db, input.name, input.town),
			createdBy: user.id,
			submittedAt: now,
		},
		{ userId: user.id, roleTitle: input.role, at: now },
		{ id: newId(now.getTime()), facilityId: id, actorId: user.id, kind: 'submitted', text: input.note || null, visible: false, createdAt: now },
	)
	return c.json(await myFacilityView(db, (await getFacility(db, id))!, 'admin'), 201)
})
