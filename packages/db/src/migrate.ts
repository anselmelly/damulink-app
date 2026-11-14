import { resolve } from 'node:path'
import { createConnection } from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { loadDotEnv } from './dotenv'

loadDotEnv()
// Applies the SQL migrations to the database named in the environment (DB_*). Safe to run again.
const need = (k: string) => {
	const v = process.env[k]
	if (!v) throw new Error(`Missing ${k}`)
	return v
}
const conn = await createConnection({ host: need('DB_HOST'), port: Number(process.env.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') })
await migrate(drizzle(conn), { migrationsFolder: resolve(import.meta.dirname, '../migrations') })
await conn.end()
console.log(`migrated ${process.env.DB_NAME}`)
