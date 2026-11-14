import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createConnection } from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'

/** Reads the repo-root .env (local development) without printing it. CI sets the variables itself. */
function loadDotEnv() {
	const f = resolve(__dirname, '../../../.env')
	if (!existsSync(f)) return
	for (const line of readFileSync(f, 'utf8').split('\n')) {
		const m = line.match(/^([A-Z_]+)=(.*)$/)
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
	}
}

/** One throwaway database per test run, real migrations applied (the same SQL production gets). */
export default async function setup() {
	loadDotEnv()
	const { DB_HOST = '127.0.0.1', DB_PORT = '3306', DB_USER, DB_PASSWORD, TEST_DB_PREFIX = 'damulink_test_' } = process.env
	if (!DB_USER || !DB_PASSWORD) throw new Error('Set DB_USER and DB_PASSWORD (see .env.example)')
	const name = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`
	const admin = await createConnection({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD })
	await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
	const conn = await createConnection({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, database: name, multipleStatements: false })
	await migrate(drizzle(conn), { migrationsFolder: resolve(__dirname, '../../../packages/db/migrations') })
	await conn.end()
	process.env.TEST_DB_NAME = name
	return async () => {
		await admin.query(`DROP DATABASE IF EXISTS \`${name}\``)
		await admin.end()
	}
}
