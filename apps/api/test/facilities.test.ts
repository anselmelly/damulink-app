import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addFacility, get, json, makeTestApp, resetAccounts } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())

describe('GET /api/facilities', () => {
	it('is public and finds by name or town, case-insensitively', async () => {
		await addFacility(t, 'Rift County Hospital', 'Nakuru')
		await addFacility(t, 'Lakeview Hospital', 'Kisumu')
		expect((await json(await get(t, '/api/facilities?q=rift'))).map((f: any) => f.name)).toEqual(['Rift County Hospital'])
		expect((await json(await get(t, '/api/facilities?q=KISUMU'))).map((f: any) => f.name)).toEqual(['Lakeview Hospital'])
	})
	it('lists verified facilities only', async () => {
		await addFacility(t, 'Hidden Clinic', 'Nyeri', 'pending')
		expect(await json(await get(t, '/api/facilities'))).toEqual([])
	})
	it('returns at most 20, and an empty query returns the first page', async () => {
		for (let i = 0; i < 25; i++) await addFacility(t, `Clinic ${String(i).padStart(2, '0')}`)
		expect(await json(await get(t, '/api/facilities'))).toHaveLength(20)
	})
	it('treats % and _ in the query as plain text', async () => {
		await addFacility(t, 'Rift County Hospital')
		expect(await json(await get(t, '/api/facilities?q=%25'))).toEqual([])
	})
})
