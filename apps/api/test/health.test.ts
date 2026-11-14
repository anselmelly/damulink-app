import { afterAll, describe, expect, it } from 'vitest'
import { json, makeTestApp } from './helpers'

const { app, pool } = makeTestApp()
afterAll(() => pool.end())

describe('GET /api/health', () => {
	it('answers ok, names the app, and proves the database is reachable', async () => {
		const res = await app.request('/api/health')
		expect(res.status).toBe(200)
		const body = await json(res)
		expect(body).toMatchObject({ ok: true, app: 'DamuLink', time: '2026-11-14T08:00:00.000Z' })
	})

	it('puts a request id on every response', async () => {
		const res = await app.request('/api/health')
		expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/)
	})
})
