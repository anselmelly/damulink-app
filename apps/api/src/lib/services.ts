export type MailMessage = { to: string; subject: string; text: string }
export type SmsMessage = { to: string; text: string }
export interface Mailer {
	send(m: MailMessage): Promise<void>
}
export interface Sms {
	send(m: SmsMessage): Promise<void>
}

/** Keeps what was "sent" in memory: used by the tests. */
export class MemoryOutbox<T> {
	sent: T[] = []
	async send(m: T): Promise<void> {
		this.sent.push(m)
	}
}

/**
 * Stand-in until a real provider is connected: nothing leaves the machine.
 * Outside production the whole message is printed so a developer can follow the link or read the code.
 * In production only who it was for is logged, because the body holds a one-time secret.
 */
export function consoleDriver<T extends { to: string }>(kind: 'mail' | 'sms', production: boolean): { send(m: T): Promise<void> } {
	return {
		async send(m: T) {
			console.log(production ? `[${kind}] to ${m.to} (not sent: no provider configured)` : `[${kind}] to ${m.to}\n${JSON.stringify(m, null, 2)}`)
		},
	}
}
