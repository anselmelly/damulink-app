import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(pbkdf2)
const KEYLEN = 32

/** Hashes are `pbkdf2$<iterations>$<salt hex>$<hash hex>` so the cost can be raised later without breaking old hashes. */
export async function hashPassword(password: string, iterations: number): Promise<string> {
	const salt = randomBytes(16)
	const hash = await derive(password, salt, iterations, KEYLEN, 'sha256')
	return `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** Fails closed: anything that is not a well-formed pbkdf2 hash with a sane cost is simply "wrong password". */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const m = /^pbkdf2\$(\d+)\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(stored)
	if (!m) return false
	const iterations = Number(m[1])
	if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 5_000_000) return false
	const hash = await derive(password, Buffer.from(m[2], 'hex'), iterations, KEYLEN, 'sha256')
	return timingSafeEqual(hash, Buffer.from(m[3], 'hex'))
}
