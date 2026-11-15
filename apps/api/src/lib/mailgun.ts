import type { MailMessage, Mailer } from './services'

export type MailgunConfig = { apiKey: string; domain: string; region: 'us' | 'eu'; from: string }

/**
 * Sends mail through Mailgun's HTTP API. A failure throws a short error with the status only:
 * never the key, the recipient or the text (callers log the message).
 */
export function mailgunDriver(c: MailgunConfig & { fetch?: typeof fetch }): Mailer {
	const url = `https://api${c.region === 'eu' ? '.eu' : ''}.mailgun.net/v3/${encodeURIComponent(c.domain)}/messages`
	const auth = `Basic ${Buffer.from(`api:${c.apiKey}`).toString('base64')}`
	const send = c.fetch ?? fetch
	return {
		async send(m: MailMessage) {
			let res: Response
			try {
				res = await send(url, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ from: c.from, to: m.to, subject: m.subject, text: m.text }).toString(), signal: AbortSignal.timeout(15_000) })
			} catch {
				throw new Error('mailgun: could not reach the service')
			}
			if (!res.ok) throw new Error(`mailgun: refused the message (status ${res.status})`)
		},
	}
}
