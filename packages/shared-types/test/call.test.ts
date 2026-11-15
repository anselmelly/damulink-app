import { describe, expect, it } from 'vitest'
import { BLOOD_TYPES, compatibleTypes, formatCallNumber, publicTextProblem } from '../src'

describe('compatibleTypes (who can give to a patient)', () => {
	it.each([
		['A+', ['A+', 'A-', 'O+', 'O-']],
		['O-', ['O-']],
		['AB+', ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-']],
		['B-', ['B-', 'O-']],
		['AB-', ['AB-', 'A-', 'B-', 'O-']],
	])('%s', (type, want) => expect([...compatibleTypes(type)].sort()).toEqual([...want].sort()))
	it('every type is compatible with itself, and an unknown type has none', () => {
		for (const b of BLOOD_TYPES) expect(compatibleTypes(b)).toContain(b)
		expect(compatibleTypes('unsure')).toEqual([])
	})
})

it('formats call numbers', () => expect(formatCallNumber(187)).toBe('CALL-0187'))

describe('publicTextProblem', () => {
	const patient = { patientName: 'Wanjiku Kamau', patientRef: 'Ward 4, bed 12' }
	it('accepts a generic appeal', () => expect(publicTextProblem('We are appealing for A+ blood. Please share this call.', patient)).toBeNull())
	it('rejects the patient name, any part of it', () => {
		expect(publicTextProblem('Help Wanjiku get blood', patient)).toMatch(/name/i)
		expect(publicTextProblem('Mrs KAMAU needs blood', patient)).toMatch(/name/i)
	})
	it('rejects ward and bed references', () => {
		expect(publicTextProblem('Needed in ward 4 today', patient)).toMatch(/ward|bed/i)
		expect(publicTextProblem('Patient on bed 12', patient)).toMatch(/ward|bed/i)
	})
	it('rejects empty and over-long text', () => {
		expect(publicTextProblem('   ', patient)).not.toBeNull()
		expect(publicTextProblem('x'.repeat(141), patient)).toMatch(/140/)
	})
})
