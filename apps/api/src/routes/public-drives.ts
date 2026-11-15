import { Hono, type Context } from 'hono'
import { addInterest, getPublicDrive, hasInterest, hit, listPublicDrives, type PublicDriveRow } from '@damu/db'
import { DRIVE_DEFAULTS, driveInterestInput, driveRef, normalizePhone, type PublicDrive } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { driveLink, nairobiDay } from '../lib/drives'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { numberSetting } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** No login needed. Everything here is safe for anyone: no host contact, and no names or phones of interested people. */
export const publicDriveRoutes = new Hono<AppEnv>()

const nairobiTime = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(11, 16)
const ip = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

/** Over once it is cancelled or closed, or its end time has passed (Nairobi time). */
function stateOf(r: PublicDriveRow, now: Date): PublicDrive['state'] {
	if (r.d.status === 'cancelled') return 'cancelled'
	const day = nairobiDay(now)
	return r.d.status === 'closed' || r.d.date < day || (r.d.date === day && r.d.ends <= nairobiTime(now)) ? 'ended' : 'open'
}
const view = (c: Context<AppEnv>, r: PublicDriveRow, interested: boolean): PublicDrive => ({
	code: driveRef(r.d.number),
	short: r.d.short,
	host: r.d.host,
	venue: r.d.venue,
	town: r.d.town,
	date: r.d.date,
	starts: r.d.starts,
	ends: r.d.ends,
	text: r.d.publicText,
	facility: { name: r.facilityName, town: r.facilityTown },
	link: driveLink(c.var.config.appUrl, r.d.short),
	state: stateOf(r, c.var.clock.now()),
	interested,
})

publicDriveRoutes.use('*', async (c, next) => {
	if ((await hit(c.var.db, `public-drives:${ip(c)}`, 60_000, c.var.clock.now())) > 60) throw new ApiError(429, 'too_many_requests', 'Too many requests. Try again in a minute.')
	await next()
})

const find = async (c: Context<AppEnv>, code: string) => {
	const n = /^DRIVE-(\d+)$/i.exec(code)?.[1]
	const r = await getPublicDrive(c.var.db, n ? { number: Number(n) } : { short: code.toLowerCase().slice(0, 20) })
	if (!r) throw new ApiError(404, 'not_found', 'Not found.')
	return r
}

/** The signed-in person, if a token was sent. A bad token is ignored on reads and an error on writes. */
async function softUser(c: Context<AppEnv>, strict: boolean) {
	if (!c.req.header('X-Auth')) return null
	try {
		await requireAuth(c as unknown as Context<AuthEnv>, async () => {})
	} catch (e) {
		if (strict) throw e
		return null
	}
	return (c as unknown as Context<AuthEnv>).var.user
}

publicDriveRoutes.get('/', async (c) => {
	const now = c.var.clock.now()
	const town = c.req.query('town')?.trim().slice(0, 80) || undefined
	const rows = await listPublicDrives(c.var.db, { day: nairobiDay(now), time: nairobiTime(now), town })
	return c.json({ items: rows.map((r) => view(c, r, false)) })
})

publicDriveRoutes.get('/by-short/:short', async (c) => c.json(view(c, await find(c, c.req.param('short')), false)))

publicDriveRoutes.get('/:code', async (c) => {
	const r = await find(c, c.req.param('code'))
	const user = await softUser(c, false)
	return c.json(view(c, r, user ? await hasInterest(c.var.db, r.d.id, { userId: user.id }) : false))
})

publicDriveRoutes.post('/:code/interest', async (c) => {
	const { db, clock } = c.var
	const user = await softUser(c, true)
	const r = await find(c, c.req.param('code'))
	const now = clock.now()
	const limit = await numberSetting(db, 'drives.interest_per_ip_hour', DRIVE_DEFAULTS.interestPerIpHour)
	if ((await hit(db, `drive-interest:${ip(c)}`, 3_600_000, now)) > limit) throw new ApiError(429, 'too_many_requests', 'Too many tries. Please wait a while.')
	if (stateOf(r, now) !== 'open') throw new ApiError(409, 'drive_over', 'This drive is no longer open.')

	let name: string
	let phone: string | null = null
	if (user) name = user.name
	else {
		const input = parseInput(driveInterestInput, await readJson(c))
		name = input.name
		if (input.phone) {
			phone = normalizePhone(input.phone)
			if (!phone) throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { phone: 'Enter a Kenyan mobile number' })
		}
	}
	if (await hasInterest(db, r.d.id, user ? { userId: user.id } : { phone, name })) return c.json({ ok: true }, 200)
	await addInterest(db, { id: newId(now.getTime()), driveId: r.d.id, name, phone, userId: user?.id ?? null, createdAt: now })
	return c.json({ ok: true }, 201)
})
