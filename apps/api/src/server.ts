import { serve } from '@hono/node-server'
import { makeDb } from '@damu/db'
import { createApp } from './app'
import { loadEnv } from './env'

const env = loadEnv()
const { db } = makeDb(env.db)
const app = createApp({ db, allowedOrigins: env.allowedOrigins })
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`api on http://127.0.0.1:${port}`))
