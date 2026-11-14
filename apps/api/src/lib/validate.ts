import type { ZodType, z } from 'zod'
import { ApiError } from './errors'

/** Parses a JSON body; a failure is 422 with one message per field. */
export function parseInput<S extends ZodType>(schema: S, data: unknown): z.output<S> {
	const r = schema.safeParse(data)
	if (r.success) return r.data
	const fields: Record<string, string> = {}
	for (const i of r.error.issues) fields[String(i.path[0] ?? 'form')] ??= i.message
	throw new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', fields)
}

export async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
	try {
		return await c.req.json()
	} catch {
		throw new ApiError(400, 'bad_json', 'The request body must be JSON.')
	}
}
