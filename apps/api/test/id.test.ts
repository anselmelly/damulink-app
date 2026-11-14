import { describe, expect, it } from 'vitest'
import { newId } from '../src/lib/id'

describe('newId', () => {
	it('is 26 characters from the ULID alphabet', () => {
		expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
	})
	it('ids made in the same millisecond, or with an earlier clock, still sort in creation order', () => {
		const ids = [newId(1_800_000_000_000), newId(1_800_000_000_000), newId(1_799_999_999_000), newId(1_800_000_000_000)]
		expect([...ids].sort()).toEqual(ids)
		expect(new Set(ids).size).toBe(4)
	})
	it('a later time sorts after an earlier one', () => {
		const a = newId(1_900_000_000_000)
		expect(newId(1_900_000_000_001) > a).toBe(true)
	})
})
