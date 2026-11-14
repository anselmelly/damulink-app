import { createMiddleware } from 'hono/factory'

/** Every request gets an id, echoed in the X-Request-Id header and in the logs. */
export const requestId = createMiddleware(async (c, next) => {
	const id = crypto.randomUUID()
	c.set('requestId', id)
	c.header('X-Request-Id', id)
	await next()
})
