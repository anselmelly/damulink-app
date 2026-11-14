import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/lib/password'

describe('passwords', () => {
	it('hashes then verifies', async () => {
		const h = await hashPassword('correct-horse', 1000)
		expect(await verifyPassword('correct-horse', h)).toBe(true)
	})
	it('rejects a wrong password', async () => {
		expect(await verifyPassword('wrong', await hashPassword('correct-horse', 1000))).toBe(false)
	})
	it('two hashes of one password differ (random salt)', async () => {
		expect(await hashPassword('same', 1000)).not.toBe(await hashPassword('same', 1000))
	})
	it('stores a self-describing format', async () => {
		expect(await hashPassword('x1234567', 1000)).toMatch(/^pbkdf2\$1000\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
	})
	it('fails closed on a malformed or unsupported stored hash', async () => {
		for (const bad of ['', 'nope', 'pbkdf2$1000$abc', 'bcrypt$10$aa$bb', 'pbkdf2$5$aa$bb', 'pbkdf2$abc$aa$bb']) expect(await verifyPassword('x', bad)).toBe(false)
	})
})
