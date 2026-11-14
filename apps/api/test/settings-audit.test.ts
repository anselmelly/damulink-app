import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, getSetting, listAudit, setSetting, writeAudit } from '@damu/db'
import { sql } from 'drizzle-orm'
import { makeTestApp } from './helpers'

const { db, pool, clock } = makeTestApp()

/** Drizzle wraps driver errors as "Failed query"; the database's own message is on `cause`. */
async function refusal(p: PromiseLike<unknown>): Promise<string> {
	try {
		await p
	} catch (e: any) {
		return String(e.cause?.message ?? e.message)
	}
	return 'no error'
}
afterAll(() => pool.end())

describe('settings', () => {
	it('returns undefined for a key that was never set', async () => {
		expect(await getSetting(db, 'nothing')).toBeUndefined()
	})
	it('stores JSON and overwrites on the second set', async () => {
		await setSetting(db, 'weekly_alert_cap', { value: 3 }, clock.now())
		await setSetting(db, 'weekly_alert_cap', { value: 4 }, clock.now())
		expect(await getSetting(db, 'weekly_alert_cap')).toEqual({ value: 4 })
	})
})

describe('audit log is append-only', () => {
	beforeEach(async () => {
		// TRUNCATE does not fire row triggers, so tests can reset the table while the app still cannot delete rows
		await db.execute(sql`TRUNCATE TABLE audit_log`)
	})

	it('writes entries and lists the newest first', async () => {
		await writeAudit(db, { action: 'a' }, clock.now())
		await writeAudit(db, { action: 'b', target: 'x', detail: 'why' }, clock.now())
		const rows = await listAudit(db)
		expect(rows.map((r) => r.action)).toEqual(['b', 'a'])
	})
	it('refuses UPDATE', async () => {
		await writeAudit(db, { action: 'a' }, clock.now())
		expect(await refusal(db.update(auditLog).set({ action: 'changed' }))).toMatch(/append-only/)
	})
	it('refuses DELETE', async () => {
		await writeAudit(db, { action: 'a' }, clock.now())
		expect(await refusal(db.delete(auditLog))).toMatch(/append-only/)
	})
})
