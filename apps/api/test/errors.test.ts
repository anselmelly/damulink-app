import { afterAll, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { ApiError, errorHandler } from '../src/lib/errors'
import { json, makeTestApp } from './helpers'

const { app, pool } = makeTestApp()
afterAll(() => pool.end())

describe('error envelope', () => {
	it('unknown paths answer 404 with the standard body', async () => {
		const res = await app.request('/api/nope')
		expect(res.status).toBe(404)
		expect(await json(res)).toEqual({ error: { code: 'not_found', message: 'Not found.' } })
	})

	it('an ApiError becomes { error: { code, message, fields } } with its status', async () => {
		const t = new Hono()
		t.get('/x', () => {
			throw new ApiError(422, 'invalid', 'Check the form.', { phone: 'Enter a valid number' })
		})
		t.onError(errorHandler)
		const res = await t.request('/x')
		expect(res.status).toBe(422)
		expect(await json(res)).toEqual({ error: { code: 'invalid', message: 'Check the form.', fields: { phone: 'Enter a valid number' } } })
	})

	it('an unexpected error is a generic 500 that leaks nothing', async () => {
		const t = new Hono<{ Variables: { requestId: string } }>()
		t.use('*', async (c, next) => {
			c.set('requestId', 'test')
			await next()
		})
		t.get('/x', () => {
			throw new Error('secret table name users_v2')
		})
		t.onError(errorHandler)
		const res = await t.request('/x')
		expect(res.status).toBe(500)
		const text = JSON.stringify(await json(res))
		expect(text).not.toContain('users_v2')
		expect(text).toContain('internal')
	})
})
