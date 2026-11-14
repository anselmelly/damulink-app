import { randomBytes } from 'node:crypto'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
let lastTime = -1
let lastRandom: number[] = []

/**
 * 26-character sortable id (ULID layout): 10 characters of time, 16 of randomness.
 * Monotonic: two ids made in the same millisecond (or with the clock going back) still sort in the order they were made.
 */
export function newId(now = Date.now()): string {
	let time = now
	let rand: number[]
	if (time <= lastTime) {
		// same millisecond: carry on from the last random part, one step up
		time = lastTime
		rand = [...lastRandom]
		let i = rand.length - 1
		while (i >= 0 && rand[i] === 31) rand[i--] = 0
		if (i >= 0) rand[i]++
	} else rand = Array.from(randomBytes(16), (b) => b % 32)
	lastTime = time
	lastRandom = rand
	let t = ''
	let n = time
	for (let i = 0; i < 10; i++) {
		t = B32[n % 32] + t
		n = Math.floor(n / 32)
	}
	return t + rand.map((x) => B32[x]).join('')
}
