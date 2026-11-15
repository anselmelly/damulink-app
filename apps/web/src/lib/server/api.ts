/** The API process, on the same machine (Caddy sends /api there for browsers; the web server talks to it directly). */
export const API = process.env.API_URL ?? 'http://127.0.0.1:8790'

/** GET one public API path. Passes the visitor's address along so the API's rate limit counts visitors, not this server. */
export async function publicGet<T>(path: string, request: Request, clientAddress: () => string): Promise<{ status: number; data: T | null }> {
	let ip = request.headers.get('x-forwarded-for')
	if (!ip) ip = (() => { try { return clientAddress() } catch { return '' } })()
	const res = await fetch(`${API}/api${path}`, { headers: ip ? { 'x-forwarded-for': ip } : {} }).catch(() => null)
	if (!res) return { status: 502, data: null }
	return { status: res.status, data: res.ok ? ((await res.json()) as T) : null }
}
