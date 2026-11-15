import { describe, expect, it } from 'vitest'
import { alertText, distanceKm, inQuietHours, ringOf } from '../src'

describe('alerts helpers', () => {
	it('distance: about 5 km for 0.045 degrees of latitude', () => expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0.045, lng: 0 })).toBeCloseTo(5, 0))
	const km = { ring2Km: 10, ring3Km: 25 }
	const base = { id: 'a', lat: -0.09, lng: 34.76, county: 'Kisumu' }
	it('rings: own, near, wide, same county, outside, no pin', () => {
		expect(ringOf(base, base, km)).toBe(1)
		expect(ringOf(base, { id: 'b', lat: -0.045, lng: 34.76, county: 'Siaya' }, km)).toBe(2)
		expect(ringOf(base, { id: 'c', lat: 0.11, lng: 34.76, county: 'Siaya' }, km)).toBe(3)
		expect(ringOf(base, { id: 'd', lat: 0.4, lng: 34.76, county: 'kisumu' }, km)).toBe(3)
		expect(ringOf(base, { id: 'e', lat: 0.4, lng: 34.76, county: 'Siaya' }, km)).toBeNull()
		expect(ringOf(base, { id: 'f', lat: null, lng: null, county: 'Siaya' }, km)).toBeNull()
	})
	it('quiet hours wrap midnight', () => {
		expect([21, 23, 0, 6].map((h) => inQuietHours(h, 21, 7))).toEqual([true, true, true, true])
		expect([7, 12, 20].map((h) => inQuietHours(h, 21, 7))).toEqual([false, false, false])
	})
	it('builds the text', () => expect(alertText('X', 'A+', 'Rift', 'Nakuru', 'dl.x/c/ab')).toBe('X: A+ blood needed at Rift, Nakuru. Reply YES if you can come, or open dl.x/c/ab. Reply STOP to stop alerts.'))
})
