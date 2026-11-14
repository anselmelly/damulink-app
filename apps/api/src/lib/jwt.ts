import { createHmac, timingSafeEqual } from 'node:crypto'

export type AccessClaims = { sub: string; tv: number; iat: number; exp: number }

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

export function signAccess(claims: AccessClaims, secret: string): string {
	const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`
	return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`
}

/**
 * HS256 only: the header algorithm is checked, never trusted, so "alg: none" and HS512 tricks fail.
 * Expiry is left to the caller (it uses the injected clock, so tests can move time).
 */
export function verifyAccess(token: string, secret: string): AccessClaims | null {
	const parts = token.split('.')
	if (parts.length !== 3) return null
	try {
		const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
		if (header.alg !== 'HS256') return null
		const want = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest()
		const got = Buffer.from(parts[2], 'base64url')
		if (got.length !== want.length || !timingSafeEqual(got, want)) return null
		const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
		if (typeof c.sub !== 'string' || typeof c.tv !== 'number' || typeof c.exp !== 'number') return null
		return c as AccessClaims
	} catch {
		return null
	}
}
