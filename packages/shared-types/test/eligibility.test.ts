import { describe, expect, it } from 'vitest'
import { DEFAULT_ELIGIBILITY, addMonths, checkEligibility } from '../src'

const base = { sex: 'female' as const, dateOfBirth: '1996-04-12', today: '2026-11-14' }

describe('addMonths', () => {
	it('adds calendar months', () => expect(addMonths('2026-06-02', 4)).toBe('2026-10-02'))
	it('clamps to the end of a shorter month', () => {
		expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
		expect(addMonths('2027-11-30', 3)).toBe('2028-02-29') // leap year
	})
	it('crosses a year end', () => expect(addMonths('2026-11-15', 3)).toBe('2027-02-15'))
})

describe('age', () => {
	it('17 years old is too young, with the date they turn 18', () => {
		expect(checkEligibility({ ...base, dateOfBirth: '2009-02-01' })).toMatchObject({ status: 'too_young', eligibleOn: '2027-02-01' })
	})
	it('turns 18 today: eligible; turns 18 tomorrow: not yet', () => {
		expect(checkEligibility({ ...base, dateOfBirth: '2008-11-14' }).status).toBe('eligible')
		expect(checkEligibility({ ...base, dateOfBirth: '2008-11-15' }).status).toBe('too_young')
	})
	it('65 is still eligible, the day they turn 66 is too old', () => {
		expect(checkEligibility({ ...base, dateOfBirth: '1961-11-15' }).status).toBe('eligible') // 65 today
		expect(checkEligibility({ ...base, dateOfBirth: '1960-11-14' }).status).toBe('too_old') // 66 today
	})
})

describe('waiting period', () => {
	it('no donation on record: eligible now', () => {
		expect(checkEligibility(base)).toEqual({ status: 'eligible', weightAdvisory: false })
	})
	it('women wait 4 months, men 3, counted from the last donation', () => {
		expect(checkEligibility({ ...base, sex: 'female', lastDonationOn: '2026-08-01' })).toMatchObject({ status: 'waiting', eligibleOn: '2026-12-01' })
		expect(checkEligibility({ ...base, sex: 'male', lastDonationOn: '2026-09-01' })).toMatchObject({ status: 'waiting', eligibleOn: '2026-12-01' })
	})
	it('a man who gave on 2026-08-01 was eligible again on 2026-11-01, so on 14 November he is eligible', () => {
		expect(checkEligibility({ ...base, sex: 'male', lastDonationOn: '2026-08-01' }).status).toBe('eligible')
	})
	it('the eligible date itself counts as eligible', () => {
		expect(checkEligibility({ ...base, sex: 'female', lastDonationOn: '2026-07-14' }).status).toBe('eligible') // 4 months on 2026-11-14
		expect(checkEligibility({ ...base, sex: 'female', lastDonationOn: '2026-07-15' })).toMatchObject({ status: 'waiting', eligibleOn: '2026-11-15' })
	})
	it('uses the settings it is given', () => {
		const r = checkEligibility({ ...base, sex: 'male', lastDonationOn: '2026-10-01', settings: { ...DEFAULT_ELIGIBILITY, waitingMonthsMale: 6 } })
		expect(r).toMatchObject({ status: 'waiting', eligibleOn: '2027-04-01' })
	})
})

describe('weight is advice, not a rule', () => {
	it('below the limit still eligible, with an advisory', () => {
		expect(checkEligibility({ ...base, weightKg: 47 })).toEqual({ status: 'eligible', weightAdvisory: true })
	})
	it('at or above the limit, or unknown: no advisory', () => {
		expect(checkEligibility({ ...base, weightKg: 50 }).weightAdvisory).toBe(false)
		expect(checkEligibility({ ...base }).weightAdvisory).toBe(false)
	})
})
