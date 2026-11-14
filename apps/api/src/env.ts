import type { DbConfig } from '@damu/db'
import type { AppConfig } from './app'

export type Env = { db: DbConfig; config: AppConfig }

/** Reads the process environment once at start. A missing or weak value stops the server at boot, not on the first request. */
export function loadEnv(src: Record<string, string | undefined> = process.env): Env {
	const need = (k: string) => {
		const v = src[k]
		if (!v) throw new Error(`Missing environment variable ${k}`)
		return v
	}
	const jwtSecret = need('JWT_SECRET')
	if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
	return {
		db: { host: need('DB_HOST'), port: Number(src.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') },
		config: {
			jwtSecret,
			pbkdf2Iterations: Number(src.PBKDF2_ITERATIONS ?? 310_000),
			allowedOrigins: (src.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()),
		},
	}
}
