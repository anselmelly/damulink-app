import { Hono } from 'hono'
import { addResponse, findResponse, getFacility, getPrefs, hit, latestLiveAlert, smsOff, userByPhone } from '@damu/db'
import { BRAND, YES_WINDOW_HOURS, normalizePhone } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { covered } from '../lib/alerts'
import { textDonor } from '../lib/call-texts'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { keyMatches } from '../lib/secret'

/** What donors text back. The provider calls this with the shared key in the address; form or JSON body with `from` and `text`. */
export const smsRoutes = new Hono<AppEnv>()

smsRoutes.post('/inbound', async (c) => {
	const { db, sms, config, clock } = c.var
	if (!keyMatches(c.req.query('key'), config.webhookKey)) throw new ApiError(401, 'unauthorized', 'Not allowed.')
	const now = clock.now()
	const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
	if ((await hit(db, `sms-inbound:${ip}`, 60_000, now)) > 120) throw new ApiError(429, 'too_many_requests', 'Too many requests.')
	let body: Record<string, unknown>
	try {
		body = (c.req.header('content-type') ?? '').includes('json') ? await c.req.json() : await c.req.parseBody()
	} catch {
		throw new ApiError(422, 'invalid_input', 'Could not read the message.')
	}
	const from = typeof body.from === 'string' ? normalizePhone(body.from.slice(0, 30)) : null
	const word = typeof body.text === 'string' ? body.text.trim().toUpperCase().slice(0, 40) : ''
	const u = from ? await userByPhone(db, from) : undefined
	// the answer is the same whatever happened: nothing here confirms who is or is not a donor
	if (!u) return c.json({ ok: true })

	if (word === 'STOP') {
		const p = await getPrefs(db, u.id)
		if (p ? p.smsAlerts : u.smsOptIn) {
			await smsOff(db, u.id)
			await textDonor(db, sms, u, `${BRAND.name}: alerts are stopped. You will not get alert texts any more. You can switch them on again in your account.`, true)
		}
	} else if (word === 'YES') {
		const hit_ = await latestLiveAlert(db, u.id, new Date(now.getTime() - YES_WINDOW_HOURS * 3600_000))
		if (hit_ && !(await findResponse(db, hit_.c.id, u.id))) {
			const f = await getFacility(db, hit_.c.facilityId)
			const full = await covered(db, hit_.c)
			const added = await addResponse(db, { id: newId(now.getTime()), callId: hit_.c.id, userId: u.id, ring: hit_.a.ring, status: full ? 'not_needed' : 'willing', repliedAt: now })
			if (added) await textDonor(db, sms, u, full ? `${BRAND.name}: thank you. ${f?.name ?? 'The facility'} has enough donors for now. We will call on you again.` : `${BRAND.name}: thank you! ${f?.name ?? 'The facility'} knows you can come. They may call you to agree a time.`, true)
		}
	}
	return c.json({ ok: true })
})
