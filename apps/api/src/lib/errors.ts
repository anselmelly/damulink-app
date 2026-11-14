import type { ApiErrorBody } from '@damu/shared-types'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

/** Throw this from a route; the error handler turns it into { error: { code, message, fields? } }. */
export class ApiError extends Error {
	constructor(
		public status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
		public code: string,
		message: string,
		public fields?: Record<string, string>,
	) {
		super(message)
	}
}

export function errorHandler(err: Error, c: Context) {
	if (err instanceof ApiError) {
		const body: ApiErrorBody = { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } }
		return c.json(body, err.status)
	}
	if (err instanceof HTTPException) {
		const body: ApiErrorBody = { error: { code: 'http_error', message: err.message } }
		return c.json(body, err.status)
	}
	console.error(`[${c.get('requestId')}]`, err)
	const body: ApiErrorBody = { error: { code: 'internal', message: 'Something went wrong. Please try again.' } }
	return c.json(body, 500)
}

export function notFound(c: Context) {
	const body: ApiErrorBody = { error: { code: 'not_found', message: 'Not found.' } }
	return c.json(body, 404)
}
