import { makeDb } from '@damu/db'
import { createApp } from '../src/app'
import { type Clock, fixedClock } from '../src/lib/clock'

/** One app over the test database. The pool is shared by the file; tests clear tables they use. */
export function makeTestApp(opts: { clock?: Clock; allowedOrigins?: string[] } = {}) {
	const { db, pool } = makeDb({
		host: process.env.DB_HOST ?? '127.0.0.1',
		port: Number(process.env.DB_PORT ?? 3306),
		user: process.env.DB_USER!,
		password: process.env.DB_PASSWORD!,
		database: process.env.TEST_DB_NAME!,
	})
	const clock = opts.clock ?? fixedClock('2026-11-14T08:00:00Z')
	const app = createApp({ db, clock, allowedOrigins: opts.allowedOrigins ?? ['http://localhost:5173'] })
	return { app, db, pool, clock }
}

export async function json<T = any>(res: Response): Promise<T> {
	return (await res.json()) as T
}
