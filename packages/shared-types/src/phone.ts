/** Kenyan numbers only for now. Accepts 0712345678, 712345678, 254712345678, +254712345678 (spaces and dashes ignored). Returns +2547XXXXXXXX or null. */
export function normalizePhone(input: string): string | null {
	const digits = input.replace(/[\s-]/g, '').replace(/^\+/, '')
	let n: string
	if (/^254[17]\d{8}$/.test(digits)) n = digits.slice(3)
	else if (/^0[17]\d{8}$/.test(digits)) n = digits.slice(1)
	else if (/^[17]\d{8}$/.test(digits)) n = digits
	else return null
	return `+254${n}`
}

/** +254712345678 -> +254 7•• ••• 678 (never show a full number in a response). */
export function maskPhone(e164: string): string {
	return `${e164.slice(0, 4)} ${e164[4]}•• ••• ${e164.slice(-3)}`
}
