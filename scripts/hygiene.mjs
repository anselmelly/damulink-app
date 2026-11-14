// Fails `pnpm check` if something that must never be committed is tracked, or looks like a secret.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean)
const bad = []
for (const f of files) {
	if (/(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example')) bad.push(`${f}: env file in the tree`)
	if (/\.(pem|key)$/.test(f)) bad.push(`${f}: key file`)
}
const patterns = [
	[/^OTP_FIXED_CODE=\d/m, 'a fixed phone code set in a tracked file'],
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
	[/\b(?:DB_PASSWORD|JWT_SECRET|[A-Z_]*API_KEY|[A-Z_]*TOKEN)=['"]?[A-Za-z0-9+/_-]{16,}/, 'secret-looking assignment'],
]
for (const f of files) {
	if (/(^|\/)(node_modules|pnpm-lock\.yaml)/.test(f) || /hygiene/.test(f) || /\.(png|jpg|svg|ico|woff2?)$/.test(f)) continue
	let text
	try { text = readFileSync(f, 'utf8') } catch { continue }
	for (const [re, why] of patterns) if (re.test(text)) bad.push(`${f}: ${why}`)
	if (/\bsanctum\b/i.test(text) && !/CLAUDE\.md|README/.test(f)) bad.push(`${f}: mentions sanctum (JWT only)`)
}
if (bad.length) {
	console.error('hygiene failed:\n' + bad.join('\n'))
	process.exit(1)
}
console.log(`hygiene ok (${files.length} files)`)
