import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { hit, peek, reset } from '@damu/db'
import { makeTestApp, resetAccounts } from './helpers'

const t = makeTestApp()
beforeEach(() => resetAccounts(t))
afterAll(() => t.pool.end())
const MIN = 60_000

describe('rate limit counters', () => {
	it('counts hits per key and keeps keys independent', async () => {
		expect(await hit(t.db, 'a', 15 * MIN, t.clock.now())).toBe(1)
		expect(await hit(t.db, 'a', 15 * MIN, t.clock.now())).toBe(2)
		expect(await hit(t.db, 'b', 15 * MIN, t.clock.now())).toBe(1)
	})
	it('restarts the window once it has passed', async () => {
		await hit(t.db, 'a', 15 * MIN, t.clock.now())
		await hit(t.db, 'a', 15 * MIN, t.clock.now())
		t.clock.advance(16 * MIN)
		expect(await peek(t.db, 'a', 15 * MIN, t.clock.now())).toBe(0)
		expect(await hit(t.db, 'a', 15 * MIN, t.clock.now())).toBe(1)
	})
	it('reset clears a key', async () => {
		await hit(t.db, 'a', 15 * MIN, t.clock.now())
		await reset(t.db, 'a')
		expect(await peek(t.db, 'a', 15 * MIN, t.clock.now())).toBe(0)
	})
})
