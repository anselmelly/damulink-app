import { describe, expect, it } from 'vitest'
import { isDonorCode, maskPhone, newDonorCode, normalizePhone } from '../src'

describe('normalizePhone', () => {
	it.each([['0712345678'], ['712345678'], ['254712345678'], ['+254 712 345 678'], ['0712-345-678']])('accepts %s', (v) => {
		expect(normalizePhone(v)).toBe('+254712345678')
	})
	it('accepts the 01 range too', () => expect(normalizePhone('0112345678')).toBe('+254112345678'))
	it.each([['12345'], ['0612345678'], ['+255712345678'], ['07123456789'], ['abc']])('rejects %s', (v) => {
		expect(normalizePhone(v)).toBeNull()
	})
	it('masks all but the first and last digits', () => expect(maskPhone('+254712345678')).toBe('+254 7•• ••• 678'))
})

describe('donor codes', () => {
	it('new codes match the pattern and never contain 0 O 1 I L', () => {
		for (let i = 0; i < 500; i++) {
			const c = newDonorCode()
			expect(isDonorCode(c)).toBe(true)
			expect(c.slice(3)).not.toMatch(/[01OIL]/)
		}
	})
	it('uses the active brand prefix', () => expect(newDonorCode().startsWith('DL-')).toBe(true))
	it('accepts the known prefix and rejects bad shapes', () => {
		expect(isDonorCode('DL-7K4Q-2M')).toBe(true)
		expect(isDonorCode('XX-7K4Q-2M')).toBe(false)
		expect(isDonorCode('DL-7K4Q-2')).toBe(false)
		expect(isDonorCode('DL-0K4Q-2M')).toBe(false)
	})
})
