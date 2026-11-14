import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql } from 'drizzle-orm'
import { BRAND } from '@damu/shared-types'
import type { Db } from '@damu/db'
import { type Clock, systemClock } from './lib/clock'
import { errorHandler, notFound } from './lib/errors'
import { requestId } from './middleware/request-id'
import { authRoutes } from './routes/auth'
import { facilityRoutes } from './routes/facilities'
import { meRoutes } from './routes/me'

export type AppConfig = { jwtSecret: string; pbkdf2Iterations: number; allowedOrigins: string[] }
export type AppDeps = { db: Db; config: AppConfig; clock?: Clock }
export type AppEnv = { Variables: { requestId: string; db: Db; clock: Clock; config: AppConfig } }

export function createApp(deps: AppDeps) {
	const app = new Hono<AppEnv>()
	const clock = deps.clock ?? systemClock

	app.use('*', requestId)
	app.use('*', async (c, next) => {
		c.set('db', deps.db)
		c.set('clock', clock)
		c.set('config', deps.config)
		await next()
	})
	// X-Auth carries the JWT (never Authorization); browsers must be allowed to send and read it.
	app.use('*', cors({ origin: deps.config.allowedOrigins, allowHeaders: ['Content-Type', 'X-Auth'], exposeHeaders: ['X-Request-Id'], maxAge: 600 }))

	app.get('/api/health', async (c) => {
		await c.var.db.execute(sql`select 1`)
		return c.json({ ok: true, app: BRAND.name, time: clock.now().toISOString() })
	})
	app.route('/api/auth', authRoutes)
	app.route('/api/me', meRoutes as unknown as Hono<AppEnv>)
	app.route('/api/facilities', facilityRoutes)

	app.onError(errorHandler)
	app.notFound(notFound)
	return app
}
