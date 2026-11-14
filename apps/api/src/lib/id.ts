import { randomBytes } from 'node:crypto'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 26-character sortable id (ULID layout): 10 characters of time, 16 of randomness. */
export function newId(now = Date.now()): string {
	let t = ''
	let n = now
	for (let i = 0; i < 10; i++) {
		t = B32[n % 32] + t
		n = Math.floor(n / 32)
	}
	return t + Array.from(randomBytes(16), (b) => B32[b % 32]).join('')
}
