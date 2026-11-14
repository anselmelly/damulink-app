/** Time comes from here so tests can fix it. Always UTC; the web shows Africa/Nairobi. */
export type Clock = { now(): Date }
export const systemClock: Clock = { now: () => new Date() }
export function fixedClock(iso: string): Clock & { set(iso: string): void; advance(ms: number): void } {
	let t = new Date(iso).getTime()
	return { now: () => new Date(t), set: (v) => void (t = new Date(v).getTime()), advance: (ms) => void (t += ms) }
}
