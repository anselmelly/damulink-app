<script lang="ts">
	import Icon from './Icon.svelte'

	/** `value` is YYYY-MM-DD once the three boxes hold a real calendar date, otherwise ''. `initial` fills the boxes the first time. */
	let { value = $bindable(''), error = '', initial = '', touched = $bindable(false) }: { value?: string; error?: string; initial?: string; touched?: boolean } = $props()

	const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
	// svelte-ignore state_referenced_locally: only the first value of `initial` is wanted
	let day = $state(initial ? String(Number(initial.slice(8, 10))) : '')
	// svelte-ignore state_referenced_locally
	let month = $state(initial ? String(Number(initial.slice(5, 7))) : '')
	// svelte-ignore state_referenced_locally
	let year = $state(initial ? initial.slice(0, 4) : '')

	$effect(() => {
		const d = Number(day), m = Number(month), y = Number(year)
		let out = ''
		if (Number.isInteger(d) && Number.isInteger(m) && Number.isInteger(y) && year.length === 4 && day && month) {
			const t = new Date(Date.UTC(y, m - 1, d))
			if (t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d) out = t.toISOString().slice(0, 10)
		}
		value = out
		touched = !!(day || month || year)
	})
</script>

<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0">
	<legend class="field-label mb-2 p-0">Date of birth</legend>
	<div class="grid grid-cols-[1fr_2fr_1.3fr] gap-2">
		<div class="flex flex-col gap-1.5">
			<label for="dob-day" class="text-[13px] leading-[18px] text-muted">Day</label>
			<input id="dob-day" type="text" inputmode="numeric" autocomplete="bday-day" placeholder="14" maxlength="2" bind:value={day} class="field-input px-3 text-center {error ? 'is-error' : ''}" />
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="dob-month" class="text-[13px] leading-[18px] text-muted">Month</label>
			<select id="dob-month" autocomplete="bday-month" bind:value={month} class="field-input px-3 {error ? 'is-error' : ''}">
				<option value="">Month</option>
				{#each MONTHS as m, i}<option value={String(i + 1)}>{m}</option>{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="dob-year" class="text-[13px] leading-[18px] text-muted">Year</label>
			<input id="dob-year" type="text" inputmode="numeric" autocomplete="bday-year" placeholder="1995" maxlength="4" bind:value={year} class="field-input px-3 text-center {error ? 'is-error' : ''}" />
		</div>
	</div>
	{#if error}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{error}</span>{:else}<span class="field-help">Donors must be 18 to 65.</span>{/if}
</fieldset>
