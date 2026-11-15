import { serve } from '@hono/node-server'
import { loadDotEnv, makeDb } from '@damu/db'
import { createApp } from './app'
import { loadEnv } from './env'
import { expireCalls } from './lib/calls'
import { consoleDriver } from './lib/services'

loadDotEnv() // local development; in production the real environment is already set
const env = loadEnv()
const { db } = makeDb(env.db)
const production = process.env.NODE_ENV === 'production'
if (production) console.warn('No mail or SMS provider is connected: codes and links are NOT being sent.')
const app = createApp({ db, config: env.config, mailer: consoleDriver('mail', production), sms: consoleDriver('sms', production) })
const port = Number(process.env.PORT ?? 8790)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`api on http://127.0.0.1:${port}`))
// calls whose time is up close even when nobody is looking at them (reads sweep too)
setInterval(() => void expireCalls(db, new Date()).catch((e) => console.error('call sweep failed', e instanceof Error ? e.message : 'unknown error')), 5 * 60_000).unref()
