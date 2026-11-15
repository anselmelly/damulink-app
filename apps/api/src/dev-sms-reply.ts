import { loadDotEnv } from '@damu/db'

// Development: plays a donor's text to the local inbound address, e.g. `pnpm --filter @damu/api sms:reply 0712000011 YES`.
loadDotEnv()
const [phone, ...words] = process.argv.slice(2)
const key = process.env.SMS_WEBHOOK_KEY
if (!phone || !words.length || !key) throw new Error('Usage: sms:reply <phone> <text>   (SMS_WEBHOOK_KEY must be set in .env)')
const port = process.env.PORT ?? 8790
const res = await fetch(`http://127.0.0.1:${port}/api/sms/inbound?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ from: phone, text: words.join(' ') }) })
console.log(res.status, await res.text())
