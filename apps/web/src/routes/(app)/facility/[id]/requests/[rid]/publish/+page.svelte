<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { URGENCY_CARDS } from '$lib/calls'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { MyFacilityView, PublishPreview } from '@damu/shared-types'

	const id = $derived(page.params.id)
	const rid = $derived(page.params.rid)
	let f = $state<MyFacilityView | null>(null)
	let p = $state<PublishPreview | null>(null)
	let missing = $state('')
	let types = $state<string[]>([])
	let urgency = $state('normal')
	let text = $state('')
	let isPublic = $state(true)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})

	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			p = await auth.call<PublishPreview>(`/my-facilities/${id}/requests/${rid}/publish-preview`)
			types = [...p.compatibleTypes]
			urgency = p.urgency
			text = p.suggestedText
		} catch (e) {
			missing = e instanceof ApiError && e.code === 'invalid_move' ? 'Only an approved request can be published.' : 'Request not found.'
		}
	})
	const toggle = (t: string) => (types = types.includes(t) ? types.filter((x) => x !== t) : [...types, t])

	async function publish(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		errors = {}
		busy = true
		try {
			const c = await auth.call<{ id: string }>(`/my-facilities/${id}/requests/${rid}/publish`, { body: { types, urgency, publicText: text, isPublic, smsEnabled: false } })
			await goto(`/facility/${id}/calls/${c.id}?published=1`)
		} catch (err) {
			if (err instanceof ApiError) {
				errors = err.fields
				error = Object.keys(err.fields).length ? '' : err.message
			} else error = 'Something went wrong.'
			busy = false
		}
	}
</script>

<svelte:head><title>Publish a call | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="requests">
	<a href="/facility/{id}/requests/{rid}" class="link inline-flex items-center gap-1 self-start text-[15px]"><Icon name="chev-l" class="h-5 w-5" />Request</a>
	{#if missing}
		<div class="card p-8 text-center"><h1 class="text-xl font-bold">Cannot publish</h1><p class="mt-2 text-muted">{missing}</p></div>
	{:else if !p}
		<p class="text-muted" role="status">Loading…</p>
	{:else}
		<header class="flex flex-col gap-1">
			<p class="eyebrow">Publish a call</p>
			<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">{p.bloodType} blood, {p.units} {p.units === 1 ? 'unit' : 'units'} at {p.facilityName}</h1>
			<p class="text-[15px] text-muted">The public call never shows the patient, the ward or the bed.</p>
		</header>
		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		<form onsubmit={publish} novalidate class="flex flex-col gap-6">
			<section class="card flex flex-col gap-3 p-6 md:p-8">
				<h2 class="text-lg font-bold">Who can donate</h2>
				<p class="text-[15px] text-muted">These blood types are compatible with {p.bloodType}. You may remove types, never add them.</p>
				<div class="flex flex-wrap gap-2">
					{#each p.compatibleTypes as t}<label><input type="checkbox" checked={types.includes(t)} onchange={() => toggle(t)} class="peer sr-only" /><span class="seg-box !w-20">{t}</span></label>{/each}
				</div>
				{#if errors.types}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.types}</span>{/if}
			</section>

			<section class="card flex flex-col gap-3 p-6 md:p-8">
				<h2 class="text-lg font-bold">Urgency</h2>
				<div class="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Urgency">
					{#each URGENCY_CARDS as [v, l, d]}
						<label><input type="radio" name="urg" value={v} bind:group={urgency} class="peer sr-only" /><span class="block cursor-pointer rounded-xl border-[1.5px] border-field bg-white p-4 peer-checked:border-rose-600 peer-checked:bg-rose-50 peer-focus-visible:ring-4 peer-focus-visible:ring-pink-300"><span class="block font-bold">{l}</span><span class="mt-1 block text-[14px] leading-5 text-muted">{d}</span></span></label>
					{/each}
				</div>
				<p class="text-[14px] text-muted">Alerts to donors by SMS arrive in the next update. Urgency is saved with the call.</p>
			</section>

			<section class="card flex flex-col gap-3 p-6 md:p-8">
				<h2 class="text-lg font-bold">Public text</h2>
				<label for="pt" class="field-label">What people read <span class="font-normal text-muted">(no names, wards or beds)</span></label>
				<textarea id="pt" rows="3" maxlength={p.textMax} bind:value={text} class="field-input !h-auto py-3 {errors.publicText ? 'is-error' : ''}"></textarea>
				<div class="flex justify-between text-[14px]"><span>{#if errors.publicText}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.publicText}</span>{/if}</span><span class="text-muted">{text.length}/{p.textMax}</span></div>
				<label class="mt-1 flex cursor-pointer items-center gap-3 text-[15px] font-semibold"><input type="checkbox" bind:checked={isPublic} class="peer sr-only" /><span class="switch"></span>Public call (listed on the calls page, with a share link)</label>
				{#if errors.isPublic}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.isPublic}</span>{/if}
				<label class="flex items-center gap-3 text-[15px] font-semibold text-muted"><input type="checkbox" disabled class="peer sr-only" /><span class="switch opacity-60"></span>SMS alerts to matching donors (next update)</label>
			</section>

			<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
				<a href="/facility/{id}/requests/{rid}" class="btn-secondary sm:!w-auto sm:px-8">Back</a>
				<button class="btn-primary sm:!w-auto sm:px-8" disabled={busy || !types.length}>{busy ? 'Publishing…' : 'Publish call'}</button>
			</div>
		</form>
	{/if}
</FacilityShell>
