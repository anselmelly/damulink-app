import type { MeResponse, SignupInput } from '@damu/shared-types'
import { ApiError, apiFetch, type Tokens } from './api'

const KEY = 'damu.session'

/** Tokens live in localStorage (survives a reload). Readable by scripts on this page, so the access token is short (15 minutes) and the refresh token rotates on every use. */
function load(): Tokens | null {
	try {
		const s = localStorage.getItem(KEY)
		return s ? (JSON.parse(s) as Tokens) : null
	} catch {
		return null
	}
}
function save(t: Tokens | null) {
	try {
		if (t) localStorage.setItem(KEY, JSON.stringify(t))
		else localStorage.removeItem(KEY)
	} catch {
		/* private mode: the session lasts until the tab closes */
	}
}

class Auth {
	tokens: Tokens | null = null
	user = $state<MeResponse | null>(null)
	/** True once we know whether someone is signed in (after the first load). */
	ready = $state(false)
	private refreshing: Promise<Tokens | null> | null = null

	/** Restores the session from storage and fetches the user. Safe to call from every page. */
	async init(): Promise<void> {
		if (this.ready) return
		this.tokens = load()
		if (this.tokens) {
			try {
				this.user = await this.call<MeResponse>('/me')
			} catch {
				this.clear()
			}
		}
		this.ready = true
	}

	private set(t: Tokens, user?: MeResponse) {
		this.tokens = t
		save(t)
		if (user) this.user = user
	}
	private clear() {
		this.tokens = null
		this.user = null
		save(null)
	}

	async signup(input: Omit<SignupInput, 'extraFacilityIds'> & { extraFacilityIds?: string[] }) {
		const r = await apiFetch<Tokens & { user: MeResponse }>('/auth/signup', { body: input })
		this.set(r, r.user)
		this.ready = true
	}
	async login(email: string, password: string) {
		const r = await apiFetch<Tokens & { user: MeResponse }>('/auth/login', { body: { email, password } })
		this.set(r, r.user)
		this.ready = true
	}
	async logout() {
		const rt = this.tokens?.refreshToken
		this.clear()
		if (rt) await apiFetch('/auth/logout', { body: { refreshToken: rt } }).catch(() => {})
	}
	/** Changes the password. Every old session dies, so the answer's new tokens replace ours. */
	async changePassword(currentPassword: string, newPassword: string) {
		const t = await this.call<Tokens>('/me/password', { body: { currentPassword, newPassword } })
		this.set(t)
	}
	/** Deletes the account (needs the password) and ends the session here. */
	async deleteAccount(password: string) {
		await this.call('/me', { method: 'DELETE', body: { password } })
		this.clear()
	}
	/** Saves a change to the profile and keeps the shown user in step. */
	async patchProfile(changes: Record<string, unknown>) {
		this.user = await this.call<MeResponse>('/me', { method: 'PATCH', body: changes })
	}
	/** Re-reads /me (after verifying a phone or email, for example). */
	async reload() {
		this.user = await this.call<MeResponse>('/me')
	}

	/** One refresh at a time, even if several requests find the token expired together. */
	private refresh(): Promise<Tokens | null> {
		const rt = this.tokens?.refreshToken
		if (!rt) return Promise.resolve(null)
		this.refreshing ??= apiFetch<Tokens>('/auth/refresh', { body: { refreshToken: rt } })
			.then((t) => {
				this.set(t)
				return t
			})
			.catch(() => {
				this.clear()
				return null
			})
			.finally(() => {
				this.refreshing = null
			})
		return this.refreshing
	}

	/** A signed-in request. If the access token has expired it refreshes once and retries; if that fails the user is signed out. */
	async call<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
		if (!this.tokens) throw new ApiError(401, 'unauthenticated', 'Please log in.')
		try {
			return await apiFetch<T>(path, { ...opts, token: this.tokens.accessToken })
		} catch (e) {
			if (!(e instanceof ApiError) || e.status !== 401 || e.code === 'token_revoked') {
				if (e instanceof ApiError && e.code === 'token_revoked') this.clear()
				throw e
			}
			const t = await this.refresh()
			if (!t) throw e
			return await apiFetch<T>(path, { ...opts, token: t.accessToken })
		}
	}
}

export const auth = new Auth()
