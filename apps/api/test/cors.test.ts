import { afterAll, describe, expect, it } from 'vitest'
import { makeTestApp } from './helpers'

const { app, pool } = makeTestApp({ allowedOrigins: ['http://localhost:5173'] })
afterAll(() => pool.end())

describe('CORS', () => {
	it('lets the web origin send X-Auth', async () => {
		const res = await app.request('/api/health', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-auth' } })
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
		expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('x-auth')
	})

	it('does not allow another origin', async () => {
		const res = await app.request('/api/health', { headers: { Origin: 'https://evil.example' } })
		expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
	})

	it('does not accept the Authorization header as the token carrier', async () => {
		const res = await app.request('/api/health', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } })
		expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase() ?? '').not.toContain('authorization')
	})
})
