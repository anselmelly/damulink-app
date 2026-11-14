import { serve } from '@hono/node-server'
import { loadDotEnv, makeDb } from '@damu/db'
import { createApp } from './app'
import { loadEnv } from './env'

loadDotEnv() // local development; in production the real environment is already set
const env = loadEnv()
const { db } = makeDb(env.db)
const app = createApp({ db, config: env.config })
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`api on http://127.0.0.1:${port}`))
