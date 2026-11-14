import type { ApiErrorBody } from '@damu/shared-types'

/** What the API said went wrong: a status, a stable code, a message for people, and per-field messages for forms. */
export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public fields: Record<string, string> = {},
	) {
		super(message)
	}
}

export type Tokens = { accessToken: string; refreshToken: string }

/** One request to /api. The access token (if any) goes in X-Auth, never Authorization. */
export async function apiFetch<T = unknown>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
	const headers: Record<string, string> = {}
	if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
	if (opts.token) headers['X-Auth'] = opts.token
	let res: Response
	try {
		res = await fetch(`/api${path}`, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
	} catch {
		throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.')
	}
	if (res.status === 204) return undefined as T
	const data = await res.json().catch(() => null)
	if (!res.ok) {
		const e = (data as ApiErrorBody | null)?.error
		throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? 'Something went wrong. Please try again.', e?.fields ?? {})
	}
	return data as T
}
