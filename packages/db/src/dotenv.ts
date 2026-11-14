import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Loads KEY=value lines from the repo-root .env into process.env (never over a variable that is already set).
 * Unlike `node --env-file`, the value is everything after the first `=`: a `#` or `&` in a password is not a comment or an operator.
 * Optional surrounding single or double quotes are removed. In production the real environment is used and this finds no file.
 */
export function loadDotEnv(file = resolve(import.meta.dirname, '../../../.env')): void {
	if (!existsSync(file)) return
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/)
		if (!m || process.env[m[1]] !== undefined) continue
		let v = m[2].replace(/\r$/, '')
		if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
		process.env[m[1]] = v
	}
}
