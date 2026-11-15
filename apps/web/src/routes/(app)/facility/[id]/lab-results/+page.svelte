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

<FacilityShell {f} width="mid" active="checkin">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Lab results</h1>
		<p class="max-w-2xl text-base leading-6 text-muted">Donors who gave a sample and are waiting for a blood type. Entering it verifies them, and they can then be matched to calls.</p>
	</header>
	{#if notice}<p class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-emerald-700" />{notice}</p>{/if}
	{#if error}<p class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />{error}</p>{/if}
	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if !items.length}
		<div class="card p-8 text-center text-muted">No samples are waiting.</div>
	{:else}
		<ul class="card divide-y divide-rose-100">
			{#each items as s}
				<li class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
					<p class="flex-1 leading-5"><span class="block text-lg font-bold">{s.name}</span><span class="block text-[13px] text-muted">{s.code} · {s.source === 'donation' ? 'Donation' : 'Blood type test'} on {day(s.on)} · Sample {s.sampleRef}</span></p>
					<select bind:value={pick[s.id]} aria-label="Blood type for {s.name}" class="field-input sm:!w-44"><option value={undefined}>Blood type</option>{#each BLOOD_CHOICES as b}<option value={b}>{b}</option>{/each}</select>
					<button type="button" class="btn-primary sm:!w-auto sm:px-8" disabled={!pick[s.id] || busy === s.id} onclick={() => save(s)}>{busy === s.id ? 'Saving…' : 'Save'}</button>
				</li>
			{/each}
		</ul>
		<p class="field-help">Save turns on once you choose a blood type.</p>
		<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Only enter what the lab confirmed. Blood types that donors say themselves are never used for matching.</p></div>
	{/if}
</FacilityShell>
