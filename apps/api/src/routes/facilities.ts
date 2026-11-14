import { Hono } from 'hono'
import { searchFacilities } from '@damu/db'
import type { AppEnv } from '../app'

export const facilityRoutes = new Hono<AppEnv>()

/** Public: verified facilities by name or town, at most 20. */
facilityRoutes.get('/', async (c) => c.json(await searchFacilities(c.var.db, (c.req.query('q') ?? '').slice(0, 100))))
