import { Hono } from 'hono'
import { toMe } from '../lib/me'
import { requireAuth, type AuthEnv } from '../middleware/auth'

export const meRoutes = new Hono<AuthEnv>()
meRoutes.use('*', requireAuth)

meRoutes.get('/', async (c) => c.json(await toMe(c.var.db, c.var.user, !!c.var.user.donorCode)))
