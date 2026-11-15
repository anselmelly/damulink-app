import { Hono } from 'hono'
import { getPublicCall, hit, listPublicCalls, type Call } from '@damu/db'
import { formatCallNumber, parseCallNumber, type PublicCall } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { expireCalls } from '../lib/calls'
import { ApiError } from '../lib/errors'

/** No login. Everything here is safe for anyone: no patient, request, requester or donor data, and no phone numbers. */
export const publicCallRoutes = new Hono<AppEnv>()

const view = (c: Call, f: { facilityName: string; town: string; county: string }): PublicCall => ({
	code: formatCallNumber(c.number),
	short: c.short,
	status: c.status,
	bloodType: c.bloodType,
	types: c.types,
	urgency: c.urgency,
	publicText: c.publicText,
	publishedAt: c.publishedAt.toISOString(),
	closesAt: c.closesAt.toISOString(),
	facility: { name: f.facilityName, town: f.town, county: f.county },
})

publicCallRoutes.use('*', async (c, next) => {
	const { db, clock } = c.var
	const now = clock.now()
	const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
	if ((await hit(db, `public-calls:${ip}`, 60_000, now)) > 60) throw new ApiError(429, 'too_many_requests', 'Too many requests. Try again in a minute.')
	await expireCalls(db, now)
	await next()
})

publicCallRoutes.get('/', async (c) => {
	const q = c.req.query()
	const rows = await listPublicCalls(c.var.db, { bloodType: q.bloodType?.slice(0, 4), town: q.town?.trim().slice(0, 80) || undefined, urgent: q.urgent === '1' })
	return c.json({ items: rows.map((r) => view(r.c, r)) })
})

publicCallRoutes.get('/:code', async (c) => {
	const key = c.req.param('code').slice(0, 20)
	const n = parseCallNumber(key)
	const r = await getPublicCall(c.var.db, n != null ? { number: n } : { short: key.toLowerCase() })
	if (!r) throw new ApiError(404, 'not_found', 'Not found.')
	return c.json(view(r.c, r))
})
