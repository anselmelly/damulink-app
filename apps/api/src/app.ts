import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql } from 'drizzle-orm'
import { BRAND } from '@damu/shared-types'
import type { Db } from '@damu/db'
import { type Clock, systemClock } from './lib/clock'
import { errorHandler, notFound } from './lib/errors'
import type { Mailer, Sms } from './lib/services'
import { requestId } from './middleware/request-id'
import { authRoutes } from './routes/auth'
import { adminRoutes } from './routes/admin'
import { donorCallRoutes } from './routes/donor-calls'
import { cronRoutes } from './routes/cron'
import { smsRoutes } from './routes/sms'
import { checkinRoutes } from './routes/checkin'
import { donorRequestRoutes } from './routes/donor-requests'
import { recordRoutes } from './routes/records'
import { facilityHomeRoutes } from './routes/facility-home'
import { driveRoutes } from './routes/drives'
import { publicDriveRoutes } from './routes/public-drives'
import { facilityCallRoutes } from './routes/facility-calls'
import { publicCallRoutes } from './routes/public-calls'
import { facilityRequestRoutes } from './routes/facility-requests'
import { facilityRoutes } from './routes/facilities'
import { facilitySignupRoutes } from './routes/facility-signup'
import { inviteRoutes } from './routes/invites'
import { myFacilityRoutes } from './routes/my-facilities'
import { meRoutes } from './routes/me'
import { requestRoutes } from './routes/requests'
import { verificationRoutes } from './routes/verification'

/** `fixedOtp` is a testing aid (see env.ts): phone codes are that value, for every number or only for `fixedOtpPhones`. */
export type AppConfig = { cronKey?: string; webhookKey?: string; jwtSecret: string; pbkdf2Iterations: number; appUrl: string; allowedOrigins: string[]; fixedOtp?: string; fixedOtpPhones?: string[] }
/** The fixed code if it applies to this phone, otherwise nothing (a random code is made). */
export const fixedCodeFor = (c: AppConfig, phone: string) => (c.fixedOtp && (!c.fixedOtpPhones || c.fixedOtpPhones.includes(phone)) ? c.fixedOtp : undefined)
export type AppDeps = { db: Db; config: AppConfig; mailer: Mailer; sms: Sms; clock?: Clock }
export type AppEnv = { Variables: { requestId: string; db: Db; clock: Clock; config: AppConfig; mailer: Mailer; sms: Sms } }

export function createApp(deps: AppDeps) {
	const app = new Hono<AppEnv>()
	const clock = deps.clock ?? systemClock

	app.use('*', requestId)
	app.use('*', async (c, next) => {
		c.set('db', deps.db)
		c.set('clock', clock)
		c.set('config', deps.config)
		c.set('mailer', deps.mailer)
		c.set('sms', deps.sms)
		await next()
	})
	// X-Auth carries the JWT (never Authorization); browsers must be allowed to send and read it.
	app.use('*', cors({ origin: deps.config.allowedOrigins, allowHeaders: ['Content-Type', 'X-Auth'], exposeHeaders: ['X-Request-Id'], maxAge: 600 }))

	app.get('/api/health', async (c) => {
		await c.var.db.execute(sql`select 1`)
		return c.json({ ok: true, app: BRAND.name, time: clock.now().toISOString() })
	})
	app.route('/api/auth', authRoutes)
	app.route('/api/auth', verificationRoutes)
	app.route('/api/auth', facilitySignupRoutes)
	app.route('/api/invites', inviteRoutes)
	app.route('/api/me', meRoutes as unknown as Hono<AppEnv>)
	app.route('/api/facilities', facilityRoutes)
	app.route('/api/requests', requestRoutes)
	app.route('/api/my-facilities/:id/requests', facilityRequestRoutes)
	app.route('/api/my-facilities/:id/calls', facilityCallRoutes)
	app.route('/api/my-facilities/:id/drives', driveRoutes)
	app.route('/api/public/calls', publicCallRoutes)
	app.route('/api/public/drives', publicDriveRoutes)
	app.route('/api/sms', smsRoutes)
	app.route('/api/cron', cronRoutes)
	app.route('/api/my-facilities/:id/donor-requests', donorRequestRoutes)
	app.route('/api/my-facilities/:id/records', recordRoutes)
	app.route('/api/my-facilities/:id', facilityHomeRoutes)
	app.route('/api/my-facilities/:id', checkinRoutes)
	app.route('/api/my-facilities', myFacilityRoutes)
	app.route('/api/admin', adminRoutes)
	app.route('/api/donor/calls', donorCallRoutes as unknown as Hono<AppEnv>)

	app.onError(errorHandler)
	app.notFound(notFound)
	return app
}
