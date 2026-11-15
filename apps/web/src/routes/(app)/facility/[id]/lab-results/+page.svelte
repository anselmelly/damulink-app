<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { BLOOD_CHOICES } from '$lib/requests'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { LabSampleItem, MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let items = $state<LabSampleItem[]>([])
	let loaded = $state(false)
	let pick = $state<Record<string, string>>({})
	let busy = $state('')
	let notice = $state('')
	let error = $state('')
	const load = async () => (items = await auth.call<LabSampleItem[]>(`/my-facilities/${id}/lab-samples`))
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {}
		loaded = true
	})
	async function save(s: LabSampleItem) {
		busy = s.id
		error = notice = ''
		try {
			const r = await auth.call<{ name: string; bloodType: string }>(`/my-facilities/${id}/lab-samples/${s.id}/result`, { body: { bloodType: pick[s.id] } })
			notice = `${r.name} is now verified, blood type ${r.bloodType}.`
			await load()
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
		} finally {
			busy = ''
		}
	}
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' })
</script>

<svelte:head><title>Lab results | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="lab-results">
	<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">Lab results</h1>
	<p class="text-muted">Donors who gave a sample and are waiting for a blood type. Entering it verifies them, and they can then be matched to calls.</p>
	{#if notice}<p class="card flex items-center gap-2 p-4 font-semibold text-emerald-800" role="status"><Icon name="check" class="h-5 w-5" />{notice}</p>{/if}
	{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if !items.length}
		<div class="card p-8 text-center text-muted">No samples are waiting.</div>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each items as s}
				<li class="card flex flex-col gap-3 p-5">
					<p><span class="font-bold">{s.name}</span><span class="block text-[14px] text-muted">{s.code} · {s.source === 'donation' ? 'Donation' : 'Blood type test'} on {day(s.on)} · Sample {s.sampleRef}</span></p>
					<div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Blood type for {s.name}">
						{#each BLOOD_CHOICES as b}<label><input type="radio" class="peer sr-only" name="bt-{s.id}" value={b} checked={pick[s.id] === b} onchange={() => (pick[s.id] = b)} /><span class="seg-box">{b}</span></label>{/each}
						<button type="button" class="btn-primary ml-auto w-auto px-8" disabled={!pick[s.id] || busy === s.id} onclick={() => save(s)}>{busy === s.id ? 'Saving…' : 'Save'}</button>
					</div>
				</li>
			{/each}
		</ul>
		<p class="field-help">Only enter what the lab confirmed. Blood types that donors say themselves are never used for matching.</p>
	{/if}
</FacilityShell>
