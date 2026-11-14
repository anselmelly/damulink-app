<script lang="ts">
	let { value = $bindable(''), error = false }: { value?: string; error?: boolean } = $props()
	let boxes: HTMLInputElement[] = []
	const digits = $derived(Array.from({ length: 6 }, (_, i) => value[i] ?? ''))

	/** Puts digits into the boxes starting at `from` (one typed digit, a paste, or an SMS autofill of the whole code). */
	function fill(from: number, digitsIn: string) {
		const d = value.padEnd(6, ' ').slice(0, 6).split('')
		for (let k = 0; k < digitsIn.length && from + k < 6; k++) d[from + k] = digitsIn[k]
		value = d.join('').replace(/ +$/, '')
		boxes[Math.min(from + digitsIn.length, 5)]?.focus()
	}
	function onInput(i: number, e: Event) {
		const el = e.target as HTMLInputElement
		const ds = el.value.replace(/\D/g, '')
		el.value = digits[i].trim() // the state decides what the box shows
		if (ds) fill(i, ds)
		else {
			const d = value.padEnd(6, ' ').slice(0, 6).split('')
			d[i] = ' '
			value = d.join('').replace(/ +$/, '')
		}
	}
	function onKey(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) boxes[i - 1]?.focus()
	}
	function onPaste(i: number, e: ClipboardEvent) {
		const ds = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6)
		if (!ds) return
		e.preventDefault()
		fill(i === 0 ? 0 : i, ds)
	}
</script>

<div class="flex gap-2">
	{#each digits as d, i}
		<input bind:this={boxes[i]} class="otp {error ? 'is-error' : ''}" type="text" inputmode="numeric" maxlength="6" autocomplete={i === 0 ? 'one-time-code' : 'off'} aria-label="Digit {i + 1}" value={d.trim()} oninput={(e) => onInput(i, e)} onfocus={(e) => (e.target as HTMLInputElement).select()} onkeydown={(e) => onKey(i, e)} onpaste={(e) => onPaste(i, e)} />
	{/each}
</div>
