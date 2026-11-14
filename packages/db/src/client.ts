import { drizzle } from 'drizzle-orm/mysql2'
import { createPool, type Pool } from 'mysql2/promise'
import * as schema from './schema'

export type DbConfig = { host: string; port: number; user: string; password: string; database: string }
export type Db = ReturnType<typeof makeDb>['db']

/** UTC everywhere: the pool and the session both run in UTC. */
export function makeDb(cfg: DbConfig) {
	const pool: Pool = createPool({ ...cfg, timezone: 'Z', connectionLimit: 10, dateStrings: false, charset: 'utf8mb4' })
	pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"))
	return { pool, db: drizzle(pool, { schema, mode: 'default' }) }
}
