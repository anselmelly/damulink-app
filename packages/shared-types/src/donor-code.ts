import { BRAND, BRANDS } from './brand'

/** 6 characters, no 0 O 1 I L. */
export const DONOR_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const prefixes = Object.values(BRANDS).map((b) => b.codePrefix)
const re = new RegExp(`^(?:${prefixes.join('|')})-[${DONOR_CODE_ALPHABET}]{4}-[${DONOR_CODE_ALPHABET}]{2}$`)

/** New codes use the active brand's prefix; the validator accepts every profile's prefix so issued codes keep working. */
export function newDonorCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
	const pick = (n: number) => Array.from(random(n), (b) => DONOR_CODE_ALPHABET[b % DONOR_CODE_ALPHABET.length]).join('')
	return `${BRAND.codePrefix}-${pick(4)}-${pick(2)}`
}

export function isDonorCode(s: string): boolean {
	return re.test(s)
}
