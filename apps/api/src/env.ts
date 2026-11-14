import type { DbConfig } from '@damu/db'

export type Env = { db: DbConfig; allowedOrigins: string[] }

/** Reads the process environment once at start. A missing value stops the server at boot, not on the first request. */
export function loadEnv(src: Record<string, string | undefined> = process.env): Env {
	const need = (k: string) => {
		const v = src[k]
		if (!v) throw new Error(`Missing environment variable ${k}`)
		return v
	}
	return {
		db: { host: need('DB_HOST'), port: Number(src.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') },
		allowedOrigins: (src.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()),
	}
}
