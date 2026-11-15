import { serve } from '@hono/node-server'
import { loadDotEnv, makeDb } from '@damu/db'
import { createApp } from './app'
import { loadEnv } from './env'
import { mailgunDriver } from './lib/mailgun'
import { runTick } from './lib/tick'
import { consoleDriver } from './lib/services'

loadDotEnv() // local development; in production the real environment is already set
const env = loadEnv()
const { db } = makeDb(env.db)
const production = process.env.NODE_ENV === 'production'
if (production) console.warn(env.mailgun ? 'No SMS provider is connected: phone codes and alerts are NOT being sent. Email goes through Mailgun.' : 'No mail or SMS provider is connected: codes and links are NOT being sent.')
const sms = consoleDriver<{ to: string; text: string }>('sms', production)
const app = createApp({ db, config: env.config, mailer: env.mailgun ? mailgunDriver(env.mailgun) : consoleDriver('mail', production), sms })
const port = Number(process.env.PORT ?? 8790)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`api on http://127.0.0.1:${port}`))
// the scheduled work (calls that ran out of time, alerts that are due) runs once a minute from here; /api/cron/tick does the same on request
setInterval(() => void runTick(db, sms, env.config, new Date()).catch((e) => console.error('tick failed', e instanceof Error ? e.message : 'unknown error')), 60_000).unref()
