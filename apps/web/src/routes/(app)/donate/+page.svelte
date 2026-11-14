<script lang="ts">
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import { WEEKDAYS } from '@damu/shared-types'

	const user = $derived(auth.user!)
	const verified = $derived(user.donorStatus === 'verified')
	let kind = $state<'test' | 'donate'>('test')
	let facilityId = $state('')
	let days = $state<string[]>([])
	let timeOfDay = $state<'morning' | 'afternoon' | 'any'>('morning')
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})

	// A verified donor does not need a test; the first facility is the home facility.
	$effect(() => {
		if (verified) kind = 'donate'
		if (!facilityId && user.facilities[0]) facilityId = user.facilities[0].id
	})

	const label: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
	const toggle = (d: string) => (days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d])

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		errors = {}
		if (!days.length) return void (errors = { days: 'Choose at least one day' })
		busy = true
		try {
			await auth.call('/me/donation-requests', { body: { kind, facilityId, days, timeOfDay } })
			await goto('/dashboard')
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Donate or get tested | {BRAND.name}</title></svelte:head>

<AccountShell active="donate">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Donate or get tested</h1>
		<p class="text-base leading-6 text-muted">Tell a medical facility when you can come. They will call you, approve the visit, and set a date.</p>
	</header>

	{#if !user.canDonate}
		<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>You can donate from your 18th birthday. Until then you can still ask a medical facility to share a call for someone you know.</p></div>
	{:else if !user.phoneVerified}
		<div class="notice"><Icon name="phone" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Verify your phone first, so the facility can reach you. <a href="/verify-phone" class="link">Verify phone</a></p></div>
	{:else if user.facilities.length === 0}
		<div class="notice"><Icon name="building" class="mt-px h-[22px] w-[22px] text-red-700" /><p>You have not chosen a facility yet. You will be able to add one in your profile soon.</p></div>
	{:else}
		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		<form onsubmit={submit} class="card flex flex-col gap-7 p-6 md:p-8">
			<fieldset class="flex min-w-0 flex-col gap-3 border-0 p-0">
				<legend class="field-label mb-3 p-0">What would you like to do?</legend>
				{#if !verified}
					<label class="block">
						<input type="radio" name="kind" value="test" bind:group={kind} class="peer sr-only" />
						<span class="choice-card"><span class="path-icon"><Icon name="drop" class="h-6 w-6" /></span><span class="flex flex-col gap-0.5"><span class="path-title">Get my blood type tested</span><span class="path-text">A quick test. No donation. This verifies you so you can get alerts.</span></span></span>
					</label>
				{/if}
				<label class="block">
					<input type="radio" name="kind" value="donate" bind:group={kind} class="peer sr-only" />
					<span class="choice-card"><span class="path-icon"><Icon name="heart" class="h-6 w-6" /></span><span class="flex flex-col gap-0.5"><span class="path-title">Donate blood</span><span class="path-text">{verified ? 'Give blood at a facility near you.' : 'Your blood type is recorded on your first donation, which verifies you too.'}</span></span></span>
				</label>
			</fieldset>

			<div class="flex flex-col gap-2">
				<label for="facility" class="field-label">Facility</label>
				<select id="facility" bind:value={facilityId} class="field-input {errors.facilityId ? 'is-error' : ''}">
					{#each user.facilities as f, i}<option value={f.id}>{f.name}{i === 0 ? ' (home facility)' : ''}</option>{/each}
				</select>
				{#if errors.facilityId}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.facilityId}</span>{:else}<span class="field-help">Only your home and extra facilities are listed.</span>{/if}
			</div>

			<fieldset class="flex min-w-0 flex-col gap-3 border-0 p-0">
				<legend class="field-label mb-3 p-0">Days that suit you</legend>
				<div class="grid grid-cols-4 gap-2 sm:grid-cols-7">
					{#each WEEKDAYS as d}
						<label><input type="checkbox" checked={days.includes(d)} onchange={() => toggle(d)} class="peer sr-only" /><span class="flex h-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-field bg-white px-4 text-[15px] font-semibold text-ink peer-checked:border-rose-600 peer-checked:bg-rose-50 peer-checked:text-red-700 peer-focus-visible:ring-4 peer-focus-visible:ring-pink-300">{label[d]}</span></label>
					{/each}
				</div>
				{#if errors.days}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.days}</span>{/if}
			</fieldset>

			<fieldset class="flex min-w-0 flex-col gap-3 border-0 p-0">
				<legend class="field-label mb-3 p-0">Time of day</legend>
				<div class="grid grid-cols-3 gap-2">
					{#each [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['any', 'Any time']] as [v, l]}
						<label><input type="radio" name="time" value={v} bind:group={timeOfDay} class="peer sr-only" /><span class="seg-box">{l}</span></label>
					{/each}
				</div>
			</fieldset>

			<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>The facility confirms your eligibility on the day. Asking does not book a time yet; they will call you.</p></div>

			<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
				<a href="/dashboard" class="btn-secondary sm:px-8">Cancel</a>
				<button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
			</div>
		</form>
	{/if}
</AccountShell>
