import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
import { keyMatches } from '../lib/secret'
import { runTick } from '../lib/tick'

/** The scheduled work on request, for a cron line or timer that prefers a URL. The key is `?key=` or the `X-Cron-Key` header. */
export const cronRoutes = new Hono<AppEnv>()
const tick = async (c: any) => {
	const { db, sms, config, clock } = c.var
	if (!keyMatches(c.req.query('key') ?? c.req.header('X-Cron-Key'), config.cronKey)) throw new ApiError(401, 'unauthorized', 'Not allowed.')
	return c.json(await runTick(db, sms, config, clock.now()))
}
cronRoutes.post('/tick', tick)
cronRoutes.get('/tick', tick)
