<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { CALL_STATUS, closesOn, urgencyLabel } from '$lib/calls'
	import { plural } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import type { CallItem, MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let items = $state<CallItem[]>([])
	let loaded = $state(false)
	let tab = $state<'live' | 'ended'>('live')
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			items = (await auth.call<{ items: CallItem[] }>(`/my-facilities/${id}/calls`)).items
		} catch {}
		loaded = true
	})
	const shown = $derived(items.filter((c) => (tab === 'live') === (c.status === 'live')))
</script>

<svelte:head><title>Calls | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="calls">
	<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">Calls</h1>
	<div class="flex gap-2" role="tablist">
		{#each [['live', 'Live'], ['ended', 'Ended']] as [k, l]}<button type="button" role="tab" aria-selected={tab === k} onclick={() => (tab = k as typeof tab)} class="h-11 rounded-xl border-[1.5px] px-5 font-semibold {tab === k ? 'border-rose-600 bg-rose-50 text-red-700' : 'border-field bg-white'}">{l}</button>{/each}
	</div>
	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if !shown.length}
		<div class="card p-8 text-center text-muted">{tab === 'live' ? 'No live calls. Publish one from an approved request.' : 'No ended calls yet.'}</div>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each shown as c}
				<li><a href="/facility/{id}/calls/{c.id}" class="card flex items-center gap-4 p-5 hover:bg-rose-50">
					<BloodChip type={c.bloodType} />
					<span class="min-w-0 flex-1"><span class="block font-bold">{c.number} · {c.requestNumber}</span><span class="block text-[14px] text-muted">{urgencyLabel(c.urgency)} · closes {closesOn(c.closesAt)} · {plural(c.yes, 'donor')} said yes · {c.stillNeeded} still needed</span></span>
					<span class="badge {CALL_STATUS[c.status][0]}">{CALL_STATUS[c.status][1]}</span>
				</a></li>
			{/each}
		</ul>
	{/if}
</FacilityShell>
