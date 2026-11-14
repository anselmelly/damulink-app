<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { BLOOD_CHOICES, toIso, todayNairobi } from '$lib/requests'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let patientRef = $state('')
	let patientName = $state('')
	let bloodType = $state('')
	let units = $state(1)
	let date = $state('')
	let time = $state('')
	let urgency = $state<'normal' | 'urgent' | 'surge'>('normal')
	let internalNote = $state('')
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})

	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
		} catch {
			error = 'This facility was not found, or you are not on its team.'
		}
	})

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		errors = {}
		if (!patientRef.trim()) errors.patientRef = 'Enter the ward and bed, or the admission number'
		if (!bloodType) errors.bloodType = 'Choose the blood type'
		if (!date || !time) errors.neededBy = 'Choose a date and time'
		if (Object.keys(errors).length) return
		busy = true
		try {
			const r = await auth.call<{ id: string }>(`/my-facilities/${id}/requests`, { body: { patientRef, patientName: patientName || undefined, bloodType, units, urgency, neededBy: toIso(date, time), internalNote: internalNote || undefined } })
			await goto(`/facility/${id}/requests/${r.id}`)
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Raise a request | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="requests">
	<a href="/facility/{id}/requests" class="link inline-flex items-center gap-1 self-start text-[15px]"><Icon name="chev-l" class="h-5 w-5" />Requests</a>
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Raise a request</h1>
		<p class="max-w-2xl text-base leading-6 text-muted">For a patient at your own facility. There is no approval step. It goes straight to publishing.</p>
	</header>

	<form onsubmit={submit} novalidate class="card flex max-w-2xl flex-col gap-6 p-6 md:p-8">
		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}
		<p class="notice text-[14px] leading-5"><Icon name="shield" class="mt-px h-5 w-5 shrink-0" />The patient reference stays inside your facility. Public calls and SMS use a request number only.</p>
		<div class="flex flex-col gap-2">
			<label for="ref" class="field-label">Ward and bed, or admission number</label>
			<input id="ref" bind:value={patientRef} maxlength="120" class="field-input {errors.patientRef ? 'is-error' : ''}" />
			{#if errors.patientRef}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.patientRef}</span>{/if}
		</div>
		<div class="flex flex-col gap-2">
			<label for="pname" class="field-label">Patient name <span class="font-normal text-muted">(optional)</span></label>
			<input id="pname" bind:value={patientName} maxlength="120" autocomplete="off" class="field-input" />
		</div>
		<div class="flex flex-col gap-2">
			<span class="field-label" id="bt">Blood type</span>
			<div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="bt">{#each BLOOD_CHOICES as b}<label><input type="radio" name="bt" value={b} bind:group={bloodType} class="peer sr-only" /><span class="seg-box">{b}</span></label>{/each}</div>
			{#if errors.bloodType}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.bloodType}</span>{:else}<span class="field-help">Use the type the lab confirmed.</span>{/if}
		</div>
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="flex flex-col gap-2"><label for="units" class="field-label">Units needed</label><input id="units" type="number" min="1" max="10" bind:value={units} class="field-input {errors.units ? 'is-error' : ''}" />{#if errors.units}<span class="field-error">{errors.units}</span>{/if}</div>
			<div class="flex flex-col gap-2"><label for="date" class="field-label">Needed by</label><input id="date" type="date" min={todayNairobi()} bind:value={date} class="field-input {errors.neededBy ? 'is-error' : ''}" /></div>
			<div class="flex flex-col gap-2"><label for="time" class="field-label">Time</label><input id="time" type="time" bind:value={time} class="field-input {errors.neededBy ? 'is-error' : ''}" /></div>
		</div>
		{#if errors.neededBy}<span class="field-error -mt-3"><Icon name="alert" class="h-4 w-4" />{errors.neededBy}</span>{/if}
		<div class="flex flex-col gap-2">
			<span class="field-label" id="urg">Urgency</span>
			<div class="flex gap-2" role="radiogroup" aria-labelledby="urg">{#each [['normal', 'Normal'], ['urgent', 'Urgent'], ['surge', 'Surge']] as [v, l]}<label><input type="radio" name="urg" value={v} bind:group={urgency} class="peer sr-only" /><span class="seg-box">{l}</span></label>{/each}</div>
			<span class="field-help">Urgent and surge alert donors faster and skip their alert limits.</span>
		</div>
		<div class="flex flex-col gap-2">
			<label for="note" class="field-label">Internal note <span class="font-normal text-muted">(optional, never public)</span></label>
			<textarea id="note" rows="3" maxlength="500" bind:value={internalNote} class="field-input"></textarea>
		</div>
		<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
			<a href="/facility/{id}/requests" class="btn-secondary sm:!w-auto sm:px-8">Cancel</a>
			<button class="btn-primary sm:!w-auto sm:px-8" disabled={busy}>{busy ? 'Saving…' : 'Save request'}</button>
		</div>
	</form>
</FacilityShell>
