import { Hono, type Context } from 'hono'
import {
	addFacilityEvent,
	adminListFacilities,
	applicantOf,
	facilitiesWithLicense,
	getFacility,
	listFacilityEvents,
	sharedLicenses,
	updateFacility,
	writeAudit,
	type Facility,
} from '@damu/db'
import { decisionInput, maskPhone, type AdminFacilityDetail, type AdminFacilityRow } from '@damu/shared-types'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { takeDownCalls } from '../lib/calls'
import { eventView } from '../lib/facilities'
import { newId } from '../lib/id'
import { facilityDecisionMessage } from '../lib/messages'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

const requireSuperAdmin = createMiddleware<AuthEnv>(async (c, next) => {
	if (!c.var.user.isSuperAdmin) throw new ApiError(403, 'forbidden', 'This is for super admins.')
	await next()
})

export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('/*', requireAuth, requireSuperAdmin)

const row = (f: Facility, shared: Set<string>): AdminFacilityRow => ({
	id: f.id,
	name: f.name,
	type: f.type,
	town: f.town,
	county: f.county,
	status: f.status,
	licenseNumber: f.licenseNumber,
	submittedAt: f.submittedAt?.toISOString() ?? null,
	duplicateLicense: !!f.licenseNumber && shared.has(f.licenseNumber),
})

/** `?view=queue` is the verification queue (pending and needs-info, oldest first); otherwise every facility. */
adminRoutes.get('/facilities', async (c: Context<AuthEnv>) => {
	const { db } = c.var
	const rows = await adminListFacilities(db, { queueOnly: c.req.query('view') === 'queue', status: c.req.query('status') || undefined, q: (c.req.query('q') ?? '').slice(0, 100) })
	const shared = await sharedLicenses(db)
	return c.json(rows.map((f) => row(f, shared)))
})

adminRoutes.get('/facilities/:id', async (c: Context<AuthEnv>) => {
	const { db } = c.var
	const f = await getFacility(db, c.req.param('id') ?? '')
	if (!f) throw new ApiError(404, 'not_found', 'Not found.')
	const a = await applicantOf(db, f)
	const dups = f.licenseNumber ? await facilitiesWithLicense(db, f.licenseNumber, f.id) : []
	const detail: AdminFacilityDetail = {
		...row(f, new Set(dups.length && f.licenseNumber ? [f.licenseNumber] : [])),
		owner: f.owner,
		address: f.address,
		lat: f.lat,
		lng: f.lng,
		phone: f.phone,
		email: f.email,
		facilityCode: f.facilityCode,
		applicant: a ? { id: a.u.id, name: a.u.name, roleTitle: a.roleTitle ?? null, email: a.u.email, emailVerified: !!a.u.emailVerifiedAt, phone: maskPhone(a.u.phone), phoneVerified: !!a.u.phoneVerifiedAt } : null,
		events: (await listFacilityEvents(db, f.id, false)).map(({ e, byName }) => eventView(e, byName)),
		duplicates: dups.map((d) => ({ id: d.id, name: d.name, town: d.town, status: d.status })),
	}
	return c.json(detail)
})

// from-statuses each action may start from, and where it leads
const MOVES = {
	approve: { from: ['pending', 'needs_info'], to: 'verified' },
	reject: { from: ['pending', 'needs_info'], to: 'rejected' },
	ask: { from: ['pending', 'needs_info'], to: 'needs_info' },
	suspend: { from: ['verified'], to: 'suspended' },
	reactivate: { from: ['suspended'], to: 'verified' },
} as const

adminRoutes.post('/facilities/:id/decision', async (c: Context<AuthEnv>) => {
	const { db, clock, mailer, config, user } = c.var
	const input = parseInput(decisionInput, await readJson(c))
	const f = await getFacility(db, c.req.param('id') ?? '')
	if (!f) throw new ApiError(404, 'not_found', 'Not found.')
	const now = clock.now()
	const need = (what: string) => {
		throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { text: what })
	}
	if (input.action === 'reject' && !input.text) need('Write the reason the applicant will read')
	if (input.action === 'ask' && !input.text) need('Write your question')
	if (input.action === 'note' && !input.text) need('Write a note')

	if (input.action !== 'note') {
		const move = MOVES[input.action]
		if (!(move.from as readonly string[]).includes(f.status)) throw new ApiError(409, 'not_allowed', `A facility that is ${f.status.replace('_', ' ')} cannot be ${input.action === 'ask' ? 'asked a question' : input.action + (input.action.endsWith('e') ? 'd' : 'ed')}.`)
		await updateFacility(db, f.id, { status: move.to, ...(input.action === 'approve' ? { verifiedAt: now } : {}) })
	}
	if (input.action === 'suspend') await takeDownCalls(db, f.id, now, user.id)
	// reasons and questions are for the applicant; approvals, notes and suspensions are for reviewers
	const visible = input.action === 'reject' || input.action === 'ask'
	await addFacilityEvent(db, { id: newId(now.getTime()), facilityId: f.id, actorId: user.id, kind: input.action, how: input.how || null, text: input.text || null, visible, createdAt: now })
	await writeAudit(db, { actorId: user.id, action: `facility_${input.action}`, target: f.id, detail: input.how || null }, now)

	if (input.action !== 'note') {
		const a = await applicantOf(db, f)
		if (a) {
			try {
				await mailer.send(facilityDecisionMessage(a.u.email, f.name, input.action, input.text ?? null, config.appUrl))
			} catch (e) {
				console.error('could not send facility decision email', e instanceof Error ? e.message : 'unknown error')
			}
		}
	}
	const after = (await getFacility(db, f.id))!
	return c.json(row(after, await sharedLicenses(db)))
})
