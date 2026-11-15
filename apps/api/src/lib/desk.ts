import { getFacility, getMembership } from '@damu/db'
import type { Context } from 'hono'
import { ApiError } from './errors'
import type { AuthEnv } from '../middleware/auth'

/** The facility behind `:id` when the signed-in person is on its team and it is verified. Everyone else sees "not found". */
export async function desk(c: Context<AuthEnv>) {
	const id = c.req.param('id') ?? ''
	const m = await getMembership(c.var.db, id, c.var.user.id)
	const f = m ? await getFacility(c.var.db, id) : undefined
	if (!m || !f) throw new ApiError(404, 'not_found', 'Not found.')
	if (f.status !== 'verified') throw new ApiError(403, 'facility_not_verified', 'Your facility must be verified to do this.')
	return f
}
