<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import { ApiError, apiFetch } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { BLOOD_CHOICES, RELATIONS, toIso, todayNairobi } from '$lib/requests'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { PublicFacility } from '@damu/shared-types'

	const user = $derived(auth.user!)
	let facilities = $state<PublicFacility[]>([])
	let facilityId = $state('')
	let patientRef = $state('')
	let patientName = $state('')
	let relation = $state('')
	let bloodType = $state('unsure')
	let units = $state(1)
	let date = $state('')
	let time = $state('')
	let urgency = $state<'normal' | 'urgent'>('normal')
	let note = $state('')
	let genuine = $state(false)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	/** The three states of `request-limits`, shown in place of the form. */
	let blocked = $state<{ kind: 'open'; number: string; id?: string } | { kind: 'limit'; resets: string } | null>(null)

	onMount(async () => {
		try {
			facilities = await apiFetch<PublicFacility[]>('/facilities')
		} catch {
			/* the list is needed to send; the error shows on submit */
		}
		facilityId = user.facilities[0]?.id ?? ''
	})
	const facility = $derived(facilities.find((f) => f.id === facilityId))
	const resetsAt = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		errors = {}
		if (!facilityId) errors.facilityId = 'Choose a medical facility'
		if (!patientRef.trim()) errors.patientRef = 'Enter the ward and bed, or the admission number'
		if (!relation) errors.relation = 'Choose your relationship to the patient'
		if (!date || !time) errors.neededBy = 'Choose a date and time'
		if (!genuine) errors.genuine = 'Please confirm this request is genuine'
		if (Object.keys(errors).length) return
		busy = true
		try {
			const r = await auth.call<{ id: string }>('/requests', { body: { facilityId, patientRef, patientName: patientName || undefined, relation, bloodType, units, neededBy: toIso(date, time), urgency, note: note || undefined, genuine } })
			await goto(`/requests/${r.id}`)
		} catch (err) {
			if (err instanceof ApiError && err.code === 'already_open') blocked = { kind: 'open', number: err.fields.number, id: err.fields.id }
			else if (err instanceof ApiError && err.code === 'daily_limit') blocked = { kind: 'limit', resets: err.fields.resetsAt }
			else if (err instanceof ApiError && err.code === 'phone_unverified') await goto('/verify-phone')
			else if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Request blood | {BRAND.name}</title></svelte:head>

<AccountShell active="requests">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Request blood for someone</h1>
		<p class="max-w-2xl text-base leading-6 text-muted">Tell a medical facility about a patient who needs blood. Their attendants will check with the ward, then decide whether to share a call.</p>
	</header>

	{#if !user.phoneVerified}
		<div class="card flex max-w-xl flex-col items-start gap-4 p-6 md:p-8">
			<span class="path-icon h-14 w-14"><Icon name="phone" class="h-7 w-7" /></span>
			<h2 class="text-xl font-bold">Verify your phone first</h2>
			<p class="text-[15px] leading-[22px] text-muted">Medical facilities need to be able to reach you about a request. Verify your phone with a 6-digit code, then come back.</p>
			<a href="/verify-phone" class="btn-primary sm:!w-auto sm:px-8">Verify my phone</a>
		</div>
	{:else if blocked?.kind === 'open'}
		<div class="card flex max-w-xl flex-col items-start gap-4 p-6 md:p-8" role="alert">
			<span class="path-icon h-14 w-14"><Icon name="clipboard" class="h-7 w-7" /></span>
			<h2 class="text-xl font-bold">You already have an open request for this patient</h2>
			<p class="text-[15px] leading-[22px] text-muted">There can only be one active request per patient at {facility?.name ?? 'this facility'}. Request {blocked.number} is still open.</p>
			<div class="flex flex-col gap-3 sm:flex-row">
				{#if blocked.id}<a href="/requests/{blocked.id}" class="btn-primary sm:!w-auto sm:px-8">View request {blocked.number}</a>{/if}
				<a href="/requests" class="btn-secondary sm:!w-auto sm:px-8">Back to my requests</a>
			</div>
			<p class="text-[13px] text-muted">Need more units? Ask the facility to update the open request.</p>
		</div>
	{:else if blocked?.kind === 'limit'}
		<div class="card flex max-w-xl flex-col items-start gap-4 p-6 md:p-8" role="alert">
			<span class="path-icon h-14 w-14"><Icon name="clock" class="h-7 w-7" /></span>
			<h2 class="text-xl font-bold">You have reached today's limit</h2>
			<p class="text-[15px] leading-[22px] text-muted">You can send up to 3 requests a day. You can send another from {resetsAt(blocked.resets)} tomorrow. If someone needs blood right now, please call the facility directly.</p>
			<a href="/requests" class="btn-primary sm:!w-auto sm:px-8">See my requests</a>
		</div>
	{:else}
		<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
			<form onsubmit={submit} novalidate class="card flex flex-col gap-8 p-6 md:p-8">
				{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

				<fieldset class="flex flex-col gap-4">
					<legend class="text-lg font-bold">The facility <span class="block text-[15px] font-normal text-muted">Where is the patient admitted?</span></legend>
					<div class="flex flex-col gap-2">
						<label for="facility" class="field-label">Medical facility</label>
						<select id="facility" bind:value={facilityId} class="field-input {errors.facilityId ? 'is-error' : ''}">
							<option value="">Choose a medical facility</option>
							{#each facilities as f}<option value={f.id}>{f.name}, {f.town}</option>{/each}
						</select>
						{#if errors.facilityId}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.facilityId}</span>{:else}<span class="field-help">Only verified medical facilities are listed.</span>{/if}
					</div>
				</fieldset>

				<fieldset class="flex flex-col gap-4">
					<legend class="text-lg font-bold">The patient</legend>
					<p class="notice text-[14px] leading-5"><Icon name="shield" class="mt-px h-5 w-5 shrink-0" />Only the facility sees these details. They are never shown publicly or sent by SMS. Calls use a reference number only.</p>
					<div class="flex flex-col gap-2">
						<label for="ref" class="field-label">Ward and bed, or admission number</label>
						<input id="ref" bind:value={patientRef} maxlength="120" class="field-input {errors.patientRef ? 'is-error' : ''}" />
						{#if errors.patientRef}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.patientRef}</span>{:else}<span class="field-help">So attendants can find the patient.</span>{/if}
					</div>
					<div class="flex flex-col gap-2">
						<label for="pname" class="field-label">Patient name <span class="font-normal text-muted">(optional)</span></label>
						<input id="pname" bind:value={patientName} maxlength="120" autocomplete="off" class="field-input" />
						<span class="field-help">Helps attendants confirm, if you are comfortable sharing it.</span>
					</div>
					<div class="flex flex-col gap-2">
						<label for="relation" class="field-label">Your relationship to the patient</label>
						<select id="relation" bind:value={relation} class="field-input {errors.relation ? 'is-error' : ''}">
							<option value="">Choose one</option>
							{#each RELATIONS as [k, l]}<option value={k}>{l}</option>{/each}
						</select>
						{#if errors.relation}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.relation}</span>{/if}
					</div>
				</fieldset>

				<fieldset class="flex flex-col gap-4">
					<legend class="text-lg font-bold">The blood needed</legend>
					<div class="flex flex-col gap-2">
						<span class="field-label" id="bt">Blood type</span>
						<div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="bt">
							<label><input type="radio" name="bt" value="unsure" bind:group={bloodType} class="peer sr-only" /><span class="seg-box">I am not sure</span></label>
							{#each BLOOD_CHOICES as b}<label><input type="radio" name="bt" value={b} bind:group={bloodType} class="peer sr-only" /><span class="seg-box">{b}</span></label>{/each}
						</div>
						<span class="field-help">The facility confirms this before anything is published.</span>
					</div>
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="flex flex-col gap-2">
							<label for="units" class="field-label">Units needed</label>
							<input id="units" type="number" min="1" max="10" bind:value={units} class="field-input {errors.units ? 'is-error' : ''}" />
							<span class="field-help">{errors.units ?? 'One unit is one donation.'}</span>
						</div>
						<div class="flex flex-col gap-2">
							<label for="date" class="field-label">Needed by</label>
							<input id="date" type="date" min={todayNairobi()} bind:value={date} class="field-input {errors.neededBy ? 'is-error' : ''}" />
						</div>
						<div class="flex flex-col gap-2">
							<label for="time" class="field-label">Time</label>
							<input id="time" type="time" bind:value={time} class="field-input {errors.neededBy ? 'is-error' : ''}" />
						</div>
					</div>
					{#if errors.neededBy}<span class="field-error -mt-2"><Icon name="alert" class="h-4 w-4" />{errors.neededBy}</span>{/if}
					<div class="flex flex-col gap-2">
						<span class="field-label" id="urg">How urgent is it?</span>
						<div class="flex gap-2" role="radiogroup" aria-labelledby="urg">
							<label><input type="radio" name="urg" value="normal" bind:group={urgency} class="peer sr-only" /><span class="seg-box">Normal</span></label>
							<label><input type="radio" name="urg" value="urgent" bind:group={urgency} class="peer sr-only" /><span class="seg-box">Urgent</span></label>
						</div>
						<span class="field-help">Urgent means within about a day. The facility sets the final level.</span>
					</div>
					<div class="flex flex-col gap-2">
						<label for="note" class="field-label">Short note <span class="font-normal text-muted">(optional)</span></label>
						<textarea id="note" rows="3" maxlength="300" bind:value={note} class="field-input"></textarea>
					</div>
				</fieldset>

				<fieldset class="flex flex-col gap-4">
					<legend class="text-lg font-bold">Confirm</legend>
					<p class="text-[15px] leading-[22px] text-muted">The facility may call you on {user.phone} (verified).</p>
					<label class="flex items-start gap-3 text-[15px] leading-[22px]">
						<input type="checkbox" bind:checked={genuine} class="mt-0.5 h-5 w-5 shrink-0 accent-rose-600" />
						<span>I confirm this request is genuine. I know the facility will check it with the ward before anything is shared.</span>
					</label>
					{#if errors.genuine}<span class="field-error -mt-2"><Icon name="alert" class="h-4 w-4" />{errors.genuine}</span>{/if}
				</fieldset>

				<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
					<a href="/requests" class="btn-secondary sm:!w-auto sm:px-8">Cancel</a>
					<button class="btn-primary sm:!w-auto sm:px-8" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
				</div>
			</form>

			<aside class="flex flex-col gap-4">
				<div class="card flex flex-col gap-4 p-6">
					<h2 class="text-lg font-bold">What happens next</h2>
					<ol class="flex flex-col gap-4 text-[15px] leading-[22px]">
						{#each [['The facility gets your request', 'It joins their queue. You will see its status here.'], ['Attendants confirm with the ward', 'They may call you. This happens offline.'], ['They approve or ask for more', 'If it is rejected, you will see why.'], ['They may share a call', 'A public call and SMS alerts to matching donors, if the facility chooses.']] as [t, d], i}
							<li class="flex gap-3"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-red-700">{i + 1}</span><span><span class="block font-bold">{t}</span><span class="text-muted">{d}</span></span></li>
						{/each}
					</ol>
				</div>
				<div class="notice text-[14px] leading-5"><Icon name="shield" class="mt-px h-5 w-5 shrink-0" /><p><strong>Limits.</strong> One active request per patient at a medical facility, and up to 3 requests a day from your account. This keeps medical facilities' queues usable.</p></div>
			</aside>
		</div>
	{/if}
</AccountShell>
