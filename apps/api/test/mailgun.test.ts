import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env'
import { mailgunDriver } from '../src/lib/mailgun'

const base = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'd', JWT_SECRET: 'x'.repeat(40) }
const KEY = 'key-super-secret-0123456789'
const msg = { to: 'amina@example.com', subject: 'Confirm your email', text: 'Open https://dl.example/verify-email?token=abc' }

/** A fetch that records the call and answers with the given status. */
function fakeFetch(status = 200, body: unknown = { id: '<1@x>', message: 'Queued. Thank you.' }) {
	const calls: { url: string; init: RequestInit }[] = []
	const f = (async (url: string, init: RequestInit) => {
		calls.push({ url, init })
		return new Response(JSON.stringify(body), { status })
	}) as unknown as typeof fetch
	return { f, calls }
}

describe('the Mailgun mail driver', () => {
	it('posts one form to the domain, with the key as basic auth and the from address', async () => {
		const { f, calls } = fakeFetch()
		await mailgunDriver({ apiKey: KEY, domain: 'mail.example.com', region: 'us', from: 'Brand <noreply@mail.example.com>', fetch: f }).send(msg)
		expect(calls).toHaveLength(1)
		expect(calls[0].url).toBe('https://api.mailgun.net/v3/mail.example.com/messages')
		expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`api:${KEY}`).toString('base64')}`)
		const form = new URLSearchParams(String(calls[0].init.body))
		expect(Object.fromEntries(form)).toEqual({ from: 'Brand <noreply@mail.example.com>', to: msg.to, subject: msg.subject, text: msg.text })
	})
	it('uses the EU address for the EU region', async () => {
		const { f, calls } = fakeFetch()
		await mailgunDriver({ apiKey: KEY, domain: 'd.example', region: 'eu', from: 'x@d.example', fetch: f }).send(msg)
		expect(calls[0].url).toBe('https://api.eu.mailgun.net/v3/d.example/messages')
	})
	it('a refusal throws a short error that never holds the key, the address or the text', async () => {
		const { f } = fakeFetch(401, { message: 'Forbidden' })
		const err = await mailgunDriver({ apiKey: KEY, domain: 'd.example', region: 'us', from: 'x@d.example', fetch: f }).send(msg).catch((e: Error) => e)
		expect(err).toBeInstanceOf(Error)
		const text = String((err as Error).message)
		expect(text).toMatch(/401/)
		for (const secret of [KEY, msg.to, 'token=abc']) expect(text).not.toContain(secret)
	})
	it('a network failure is also an error without secrets', async () => {
		const f = (async () => {
			throw new Error(`connect ECONNREFUSED for ${KEY}`)
		}) as unknown as typeof fetch
		const err = await mailgunDriver({ apiKey: KEY, domain: 'd.example', region: 'us', from: 'x@d.example', fetch: f }).send(msg).catch((e: Error) => e)
		expect(String((err as Error).message)).not.toContain(KEY)
	})
})

describe('Mailgun settings in the environment', () => {
	it('are off unless a key and a domain are both set', () => {
		expect(loadEnv(base).mailgun).toBeUndefined()
		expect(loadEnv({ ...base, MAILGUN_API_KEY: KEY }).mailgun).toBeUndefined()
	})
	it('read the key, domain, region and from address, with a default from on the domain', () => {
		const m = loadEnv({ ...base, MAILGUN_API_KEY: KEY, MAILGUN_DOMAIN: 'mail.example.com' }).mailgun!
		expect(m).toMatchObject({ apiKey: KEY, domain: 'mail.example.com', region: 'us' })
		expect(m.from).toMatch(/<noreply@mail\.example\.com>$/)
		expect(loadEnv({ ...base, MAILGUN_API_KEY: KEY, MAILGUN_DOMAIN: 'd.example', MAILGUN_REGION: 'eu', MAIL_FROM: 'Hi <hi@d.example>' }).mailgun).toMatchObject({ region: 'eu', from: 'Hi <hi@d.example>' })
	})
	it('refuse an unknown region', () => {
		expect(() => loadEnv({ ...base, MAILGUN_API_KEY: KEY, MAILGUN_DOMAIN: 'd.example', MAILGUN_REGION: 'asia' })).toThrow(/MAILGUN_REGION/)
	})
})
