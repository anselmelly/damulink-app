<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { ReminderPrefs } from '@damu/shared-types'

	const user = $derived(auth.user!)
	let prefs = $state<ReminderPrefs | null>(null)
	let cycle = $state<ReminderPrefs['cycle']>('on_day')
	let daysBefore = $state(3)
	let cycleMonths = $state<number | null>(null)
	let appointmentReminders = $state(true)
	let saved = $state(false)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})

	function load(p: ReminderPrefs) {
		prefs = p
		cycle = p.cycle
		daysBefore = p.daysBefore
		cycleMonths = p.cycleMonths ?? p.minMonths
		appointmentReminders = p.appointmentReminders
	}
	onMount(async () => {
		try {
			load(await auth.call<ReminderPrefs>('/me/reminders'))
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not load your settings.'
		}
	})

	const months = $derived(prefs ? [...new Set([prefs.minMonths, prefs.minMonths + 1, prefs.minMonths + 2, 12])].sort((a, b) => a - b) : [])
	const next = $derived(user.eligibility.status === 'waiting' && user.eligibility.eligibleOn ? `Your next date is ${longDate(user.eligibility.eligibleOn)}.` : '')

	async function save(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		errors = {}
		saved = false
		busy = true
		try {
			load(await auth.call<ReminderPrefs>('/me/reminders', { method: 'PUT', body: { cycle, daysBefore, cycleMonths: cycle === 'custom' ? cycleMonths : null, appointmentReminders } }))
			saved = true
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Reminders | {BRAND.name}</title></svelte:head>

<AccountShell active="reminders">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Reminders</h1>
		<p class="text-base leading-6 text-muted">Tell us when to remind you to donate again.{prefs ? ` You wait ${prefs.minMonths} months between donations.` : ''}</p>
	</header>

	{#if saved}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Reminders saved.</strong></p></div>{/if}
	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

	{#if prefs}
		<form onsubmit={save} class="flex flex-col gap-6">
			<fieldset class="card flex min-w-0 flex-col gap-3 border-[1.5px] p-6">
				<legend class="sr-only">When to remind me</legend>
				<h2 class="text-[17px] font-bold">When to remind me</h2>
				<label class="block"><input type="radio" name="cycle" value="on_day" bind:group={cycle} class="peer sr-only" /><span class="choice-card"><span class="flex flex-col gap-0.5"><span class="path-title">On the day I can donate again</span><span class="path-text">Recommended. {next}</span></span></span></label>
				<label class="block"><input type="radio" name="cycle" value="days_before" bind:group={cycle} class="peer sr-only" /><span class="choice-card"><span class="flex w-full flex-col gap-3"><span class="flex flex-col gap-0.5"><span class="path-title">A few days before</span><span class="path-text">So you can plan and book a visit.</span></span><span class="flex items-center gap-3"><select aria-label="Days before" bind:value={daysBefore} class="field-input !w-40">{#each [1, 3, 5, 7] as n}<option value={n}>{n} {n === 1 ? 'day' : 'days'}</option>{/each}</select><span class="text-[15px] text-muted">before I am eligible</span></span></span></span></label>
				<label class="block"><input type="radio" name="cycle" value="custom" bind:group={cycle} class="peer sr-only" /><span class="choice-card"><span class="flex w-full flex-col gap-3"><span class="flex flex-col gap-0.5"><span class="path-title">My own cycle</span><span class="path-text">Remind me every few months after each donation. It cannot be shorter than your waiting period.</span></span><span class="flex items-center gap-3"><select aria-label="Months between reminders" bind:value={cycleMonths} class="field-input !w-40">{#each months as n}<option value={n}>{n} months</option>{/each}</select><span class="text-[15px] text-muted">after each donation</span></span>{#if errors.cycleMonths}<span class="field-error">{errors.cycleMonths}</span>{:else}<span class="field-help">Shortest allowed for you: {prefs.minMonths} months.</span>{/if}</span></span></label>
				<label class="block"><input type="radio" name="cycle" value="off" bind:group={cycle} class="peer sr-only" /><span class="choice-card"><span class="flex flex-col gap-0.5"><span class="path-title">No donation reminders</span><span class="path-text">You will still get texts about appointments you booked.</span></span></span></label>
			</fieldset>

			<section class="card divide-y divide-rose-100">
				<label class="flex cursor-pointer items-center justify-between gap-5 p-6">
					<span class="flex flex-col gap-1"><span class="text-[17px] font-bold">Appointment reminders</span><span class="text-[15px] leading-[22px] text-muted">A text the day before, and another the morning of your appointment.</span></span>
					<input type="checkbox" bind:checked={appointmentReminders} class="peer sr-only" /><span class="switch"></span>
				</label>
			</section>

			<section class="card flex flex-col gap-4 p-6">
				<h2 class="text-[17px] font-bold">What a reminder looks like</h2>
				<div class="max-w-sm rounded-2xl rounded-bl-sm bg-rose-50 p-4 text-[15px] leading-[22px]">{BRAND.name}: You can donate blood again from today. Book a visit: https://{BRAND.domain}/donate Reply STOP to stop texts.</div>
				<p class="mt-3 text-[13px] leading-[18px] text-muted">A reply of STOP turns off all {BRAND.name} texts, including alerts. Reminders wait for your quiet hours to end.</p>
			</section>

			<button type="submit" class="btn-primary sm:!w-auto sm:self-start sm:px-10" disabled={busy}>{busy ? 'Saving…' : 'Save reminders'}</button>
		</form>
	{/if}
</AccountShell>
