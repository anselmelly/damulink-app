import { createHash, timingSafeEqual } from 'node:crypto'

/** Compares a supplied key with the configured one in constant time. A missing configured key never matches. */
export function keyMatches(given: string | undefined | null, wanted: string | undefined): boolean {
	if (!wanted || !given) return false
	const h = (s: string) => createHash('sha256').update(s).digest()
	return timingSafeEqual(h(given), h(wanted))
}
