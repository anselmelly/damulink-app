import type { DbConfig } from '@damu/db'
import { normalizePhone } from '@damu/shared-types'
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
	const appUrl = (src.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
	// A fixed phone code is for testing without an SMS provider: anyone who knows it can verify any phone. On a laptop it just works.
	// On a server it needs OTP_FIXED_ALLOW_SERVER=yes (so it is never on by accident); OTP_FIXED_PHONES can narrow it to listed numbers.
	// Remove both when a real SMS provider is connected.
	const fixedOtp = src.OTP_FIXED_CODE || undefined
	let fixedOtpPhones: string[] | undefined
	if (src.OTP_FIXED_PHONES?.trim()) {
		fixedOtpPhones = src.OTP_FIXED_PHONES.split(',').map((p) => normalizePhone(p.trim()) ?? '')
		if (fixedOtpPhones.some((p) => !p)) throw new Error('OTP_FIXED_PHONES must be a comma-separated list of Kenyan phone numbers')
	}
	if (fixedOtp) {
		if (!/^\d{6}$/.test(fixedOtp)) throw new Error('OTP_FIXED_CODE must be exactly six digits')
		const local = src.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrl)
		if (!local && src.OTP_FIXED_ALLOW_SERVER !== 'yes') throw new Error('OTP_FIXED_CODE on a server needs OTP_FIXED_ALLOW_SERVER=yes (anyone who knows the code can verify any phone)')
		console.warn(`OTP_FIXED_CODE is set: phone codes are fixed${fixedOtpPhones ? ` for ${fixedOtpPhones.length} listed number(s) only` : ' for EVERY number'}. Testing only.`)
	}
	return {
		db: { host: need('DB_HOST'), port: Number(src.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') },
		config: {
			cronKey: src.CRON_KEY || undefined,
			webhookKey: src.SMS_WEBHOOK_KEY || undefined,
			jwtSecret,
			pbkdf2Iterations: Number(src.PBKDF2_ITERATIONS ?? 310_000),
			appUrl,
			fixedOtp,
			fixedOtpPhones,
			allowedOrigins: (src.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()),
		},
	}
}
