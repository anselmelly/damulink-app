import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { loadDotEnv, makeDb } from '@damu/db'
import { seedDemo } from './lib/demo-seed'

// Demo data for the shared demo server. Only adds what is missing and never changes an existing row. Safe to run again.
// Usage: node seed-demo.mjs [accounts-file]   (default ./demo-accounts.txt, mode 600). DEMO_PASSWORD sets the shared password.
loadDotEnv()
const need = (k: string) => {
	const v = process.env[k]
	if (!v) throw new Error(`Missing ${k}`)
	return v
}
const password = process.env.DEMO_PASSWORD ?? randomBytes(9).toString('base64url')
const file = process.argv[2] ?? 'demo-accounts.txt'
const { db, pool } = makeDb({ host: need('DB_HOST'), port: Number(process.env.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') })
const s = await seedDemo(db, { password, iterations: Number(process.env.PBKDF2_ITERATIONS ?? 310000), now: new Date() })
console.log(`facilities in place: ${s.facilities}, new accounts: ${s.createdAccounts}, new donors: ${s.donors}`)
if (s.skipped.length) console.log(`left alone (a real facility has the name): ${s.skipped.join(', ')}`)
if (s.createdAccounts) {
	const lines = [`Demo accounts. One password for the accounts made in this run: ${password}`, 'Sign in with the email, the password, and the facility code (facility side).', '', ...s.accounts.map((a) => `${a.facility} | code ${a.code} | ${a.role} | ${a.email}`), '', 'Donors: donor1@demo.example to donor14@demo.example (same password).']
	writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 })
	console.log(`logins written to ${file} (mode 600). The password is not printed here.`)
} else console.log('no new accounts, so no logins file was written')
await pool.end()
