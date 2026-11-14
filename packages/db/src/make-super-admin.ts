import { eq } from 'drizzle-orm'
import { loadDotEnv } from './dotenv'
import { makeDb } from './client'
import { users } from './schema'

// Usage: pnpm --filter @damu/db make-super-admin someone@example.com [--remove]
// Flags an EXISTING account as a super admin (or takes the flag away). It never creates accounts or passwords.
loadDotEnv()
const need = (k: string) => {
	const v = process.env[k]
	if (!v) throw new Error(`Missing ${k}`)
	return v
}
const email = process.argv.slice(2).find((a) => !a.startsWith('--'))?.trim().toLowerCase()
if (!email) {
	console.error('Usage: make-super-admin <email> [--remove]')
	process.exit(1)
}
const remove = process.argv.includes('--remove')
const { db, pool } = makeDb({ host: need('DB_HOST'), port: Number(process.env.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') })
const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1)
if (!u) {
	console.error(`No account with the email ${email}. Sign up first, then run this again.`)
	await pool.end()
	process.exit(1)
}
await db.update(users).set({ isSuperAdmin: !remove }).where(eq(users.id, u.id))
console.log(`${email} is ${remove ? 'no longer' : 'now'} a super admin (${process.env.DB_NAME}).`)
await pool.end()
