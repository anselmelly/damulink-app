<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { nairobiDateTime } from '$lib/dates'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { AlertPrefs } from '@damu/shared-types'

	const user = $derived(auth.user!)
	let prefs = $state<AlertPrefs | null>(null)
	let smsAlerts = $state(false)
	let emailAlerts = $state(false)
	let available = $state(true)
	let pause = $state<'keep' | 'none' | '1w' | '2w' | '1m' | '3m'>('keep')
	let weeklyCap = $state(3)
	let quietFrom = $state(21)
	let quietTo = $state(7)
	let saved = $state(false)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})

	function load(p: AlertPrefs) {
		prefs = p
		;({ smsAlerts, emailAlerts, available, weeklyCap, quietFrom, quietTo } = p)
		pause = 'keep'
	}
	onMount(async () => {
		try {
			load(await auth.call<AlertPrefs>('/me/alerts'))
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not load your settings.'
		}
	})

	// A donor can only be stricter than the system limits, so the choices run from the default towards stricter.
	const caps = $derived(prefs ? Array.from({ length: prefs.defaults.weeklyCap }, (_, i) => prefs!.defaults.weeklyCap - i) : [])
	const froms = $derived(prefs ? [0, 1, 2].map((i) => prefs!.defaults.quietFrom - i).filter((h) => h >= 0) : [])
	const tos = $derived(prefs ? [0, 1, 2].map((i) => prefs!.defaults.quietTo + i).filter((h) => h <= 23) : [])
	const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
	const pausedNow = $derived(prefs?.pausedUntil && new Date(prefs.pausedUntil) > new Date())

	async function save(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		errors = {}
		saved = false
		busy = true
		try {
			load(await auth.call<AlertPrefs>('/me/alerts', { method: 'PUT', body: { smsAlerts, emailAlerts, available, pause, weeklyCap, quietFrom, quietTo } }))
			saved = true
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Alert settings | {BRAND.name}</title></svelte:head>

<AccountShell active="alerts">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Alert settings</h1>
		<p class="text-base leading-6 text-muted">Choose how and when {BRAND.name} may contact you about a call for blood. Pick SMS, email, or both.</p>
	</header>

	{#if saved}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Settings saved.</strong></p></div>{/if}
	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}
	{#if !user.emailVerified}
		<div class="notice" role="status"><Icon name="mail" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Verify your email to get email alerts.</strong> We sent a link to {user.email}. <a href="/verify-email" class="link">Send it again</a></p></div>
	{/if}

	{#if prefs}
		<form onsubmit={save} class="flex flex-col gap-6">
			<section class="card divide-y divide-rose-100">
				<label class="flex cursor-pointer items-center justify-between gap-5 p-6">
					<span class="flex flex-col gap-1"><span class="text-[17px] font-bold">SMS alerts</span><span class="text-[15px] leading-[22px] text-muted">Text me when my blood type is needed near me. You can also reply STOP to any message.</span></span>
					<input type="checkbox" bind:checked={smsAlerts} class="peer sr-only" /><span class="switch"></span>
				</label>
				<label class="flex cursor-pointer items-center justify-between gap-5 p-6 {user.emailVerified ? '' : 'opacity-60'}">
					<span class="flex flex-col gap-1"><span class="text-[17px] font-bold">Email alerts</span><span class="text-[15px] leading-[22px] text-muted">Email me when my blood type is needed near me, at <strong class="font-bold text-ink">{user.email}</strong>. Every email has an unsubscribe link.</span>{#if errors.emailAlerts}<span class="field-error">{errors.emailAlerts}</span>{/if}</span>
					<input type="checkbox" bind:checked={emailAlerts} disabled={!user.emailVerified} class="peer sr-only" /><span class="switch"></span>
				</label>
				<label class="flex cursor-pointer items-center justify-between gap-5 p-6">
					<span class="flex flex-col gap-1"><span class="text-[17px] font-bold">I am available to donate</span><span class="text-[15px] leading-[22px] text-muted">Turn off if you are travelling or unwell. You will not be alerted while this is off.</span></span>
					<input type="checkbox" bind:checked={available} class="peer sr-only" /><span class="switch"></span>
				</label>
			</section>

			<section class="card flex flex-col gap-6 p-6">
				<div><h2 class="text-[17px] font-bold">Pause alerts</h2><p class="mt-1 text-[15px] leading-[22px] text-muted">Take a break without turning everything off.</p></div>
				<div class="flex flex-col gap-2">
					<label for="pause" class="field-label">Pause for</label>
					<select id="pause" bind:value={pause} class="field-input">
						<option value="keep">{pausedNow && prefs.pausedUntil ? `Paused until ${nairobiDateTime(prefs.pausedUntil)}` : 'Not paused'}</option>
						{#if pausedNow}<option value="none">Stop the pause</option>{/if}
						<option value="1w">1 week</option><option value="2w">2 weeks</option><option value="1m">1 month</option><option value="3m">3 months</option>
					</select>
				</div>
			</section>

			<section class="card flex flex-col gap-6 p-6">
				<div><h2 class="text-[17px] font-bold">Limits</h2><p class="mt-1 text-[15px] leading-[22px] text-muted">These apply to SMS and email together. You can only make these stricter than the {BRAND.name} defaults, never looser. Urgent calls may still reach you.</p></div>
				<div class="grid gap-5 sm:grid-cols-2">
					<div class="flex flex-col gap-2">
						<label for="cap" class="field-label">Most alerts per week</label>
						<select id="cap" bind:value={weeklyCap} class="field-input {errors.weeklyCap ? 'is-error' : ''}">{#each caps as n}<option value={n}>{n}{n === prefs.defaults.weeklyCap ? ' (default)' : ''}</option>{/each}</select>
						{#if errors.weeklyCap}<span class="field-error">{errors.weeklyCap}</span>{:else}<span class="field-help">The default is {prefs.defaults.weeklyCap} a week.</span>{/if}
					</div>
					<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0">
						<legend class="field-label mb-2 p-0">Quiet hours</legend>
						<div class="grid grid-cols-2 gap-2">
							<select aria-label="Quiet from" bind:value={quietFrom} class="field-input">{#each froms as h}<option value={h}>From {hh(h)}</option>{/each}</select>
							<select aria-label="Quiet until" bind:value={quietTo} class="field-input">{#each tos as h}<option value={h}>To {hh(h)}</option>{/each}</select>
						</div>
						{#if errors.quietFrom || errors.quietTo}<span class="field-error">{errors.quietFrom ?? errors.quietTo}</span>{:else}<span class="field-help">No texts or emails at night. Default is {hh(prefs.defaults.quietFrom)} to {hh(prefs.defaults.quietTo)}.</span>{/if}
					</fieldset>
				</div>
			</section>

			<section class="card flex flex-col gap-4 p-6">
				<h2 class="text-[17px] font-bold">What an alert looks like</h2>
				<p class="text-[13px] font-semibold uppercase tracking-wide text-muted">SMS</p>
				<div class="max-w-sm rounded-2xl rounded-bl-sm bg-rose-50 p-4 text-[15px] leading-[22px]">{BRAND.name}: O+ blood needed at {user.facilities[0]?.name ?? 'your home facility'}. Reply YES if you can come, or open the link. Reply STOP to stop alerts.</div>
				<p class="text-sm leading-5 text-muted">No patient details are ever in a text or email. Your contact details are shared with the facility only when you say yes.</p>
			</section>

			<div class="notice"><p>You are matched to calls from <strong class="font-bold">{user.facilities[0]?.name ?? 'your home facility (not chosen yet)'}</strong> first, then nearby facilities. <a href="/profile#facilities" class="link">Change facilities</a></p></div>

			<button type="submit" class="btn-primary sm:!w-auto sm:self-start sm:px-10" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
		</form>
	{/if}
</AccountShell>
