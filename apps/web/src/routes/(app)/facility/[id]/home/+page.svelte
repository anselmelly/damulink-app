<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { ago, plural } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import type { FacilityHome, MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let h = $state<FacilityHome | null>(null)
	let loaded = $state(false)
	let code = $state('')
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			if (f.status !== 'verified') return void goto(`/facility/${id}?status=1`, { replaceState: true })
			h = await auth.call<FacilityHome>(`/my-facilities/${id}/home`)
		} catch {}
		loaded = true
	})
	const hour = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
	const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Nairobi' })
	const tiles = $derived(h ? [['Requests to review', h.counts.toReview, 'requests'], ['Active calls', h.counts.activeCalls, 'calls'], ['Donor requests to follow up', h.counts.followUp, 'donor-requests'], ['Visits today', h.counts.visitsToday, 'donor-requests?tab=scheduled']] : [])
</script>

<svelte:head><title>Home | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="home">
	<header class="flex flex-col gap-1">
		<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">{f?.name ?? 'Home'}</h1>
		<p class="text-muted">{today}</p>
	</header>
	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if h}
		<div class="flex flex-wrap gap-3">
			<a class="btn-primary w-auto px-6" href="/facility/{id}/requests/new">New request</a>
			<a class="btn-secondary w-auto px-6" href="/facility/{id}/walkin">Walk-in</a>
		</div>
		<form class="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end" onsubmit={(e) => { e.preventDefault(); if (code.trim()) void goto(`/facility/${id}/checkin?code=${encodeURIComponent(code.trim())}`) }}>
			<div class="flex flex-1 flex-col gap-2"><label for="code" class="field-label">Check in a donor by code</label><input id="code" bind:value={code} placeholder={`${BRAND.codePrefix}-XXXX-XX`} class="field-input" autocomplete="off" /></div>
			<button class="btn-primary sm:w-auto sm:px-8" disabled={!code.trim()}>Find donor</button>
		</form>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each tiles as [label, n, to]}<a href="/facility/{id}/{to}" class="card p-5 hover:bg-rose-50"><span class="block text-[32px] font-extrabold leading-9">{n}</span><span class="text-[14px] text-muted">{label}</span></a>{/each}
		</div>

		<section class="flex flex-col gap-3" aria-labelledby="w-h">
			<div class="flex items-center justify-between"><h2 id="w-h" class="text-lg font-extrabold">Requests waiting</h2><a class="link" href="/facility/{id}/requests">See all</a></div>
			{#if !h.waiting.length}<p class="card p-5 text-muted">Nothing is waiting for review.</p>{:else}
				<ul class="flex flex-col gap-3">{#each h.waiting as r (r.id)}<li><a href="/facility/{id}/requests/{r.id}" class="card flex items-center gap-4 p-4 hover:bg-rose-50"><BloodChip type={r.bloodType} /><span class="min-w-0 flex-1"><span class="block font-bold">{r.number} · {plural(r.units, 'unit')}</span><span class="block text-[14px] text-muted">{r.ref} · {ago(r.at)}</span></span>{#if r.urgency !== 'normal'}<span class="badge badge-urgent">{r.urgency === 'surge' ? 'Surge' : 'Urgent'}</span>{/if}</a></li>{/each}</ul>
			{/if}
		</section>

		<section class="flex flex-col gap-3" aria-labelledby="c-h">
			<div class="flex items-center justify-between"><h2 id="c-h" class="text-lg font-extrabold">Active calls</h2><a class="link" href="/facility/{id}/calls">Manage</a></div>
			{#if !h.calls.length}<p class="card p-5 text-muted">No live calls.</p>{:else}
				<ul class="flex flex-col gap-3">{#each h.calls as c (c.id)}<li><a href="/facility/{id}/calls/{c.id}" class="card flex items-center gap-4 p-4 hover:bg-rose-50"><BloodChip type={c.bloodType} /><span class="min-w-0 flex-1"><span class="block font-bold">{c.number}</span><span class="block text-[14px] text-muted">{plural(c.yes, 'donor')} said yes</span></span><span class="text-[14px] font-semibold">{c.donated} of {c.needed} donated{c.scheduled ? `, ${c.scheduled} booked` : ''}</span></a></li>{/each}</ul>
			{/if}
		</section>

		<section class="flex flex-col gap-3" aria-labelledby="v-h">
			<div class="flex items-center justify-between"><h2 id="v-h" class="text-lg font-extrabold">Today's visits</h2><a class="link" href="/facility/{id}/donor-requests?tab=scheduled">All</a></div>
			{#if !h.visits.length}<p class="card p-5 text-muted">No visits booked today.</p>{:else}
				<ul class="card divide-y divide-rose-100">{#each h.visits as v (v.id)}<li class="flex items-center gap-4 p-4"><span class="w-14 font-bold">{hour(v.at)}</span><span class="min-w-0 flex-1"><span class="block font-semibold">{v.name}</span><span class="block text-[13px] text-muted">{v.kind === 'donate' ? 'Donation' : 'Blood type test'}</span></span><span class="badge {v.checkedIn ? 'badge-ok' : 'badge-soft'}">{v.checkedIn ? 'Checked in' : 'Expected'}</span></li>{/each}</ul>
			{/if}
		</section>

		{#if h.counts.labWaiting}
			<section class="card flex flex-col gap-2 p-5"><h2 class="text-lg font-extrabold">Lab results to enter</h2><p class="text-muted">{plural(h.counts.labWaiting, 'donor')} gave a sample and {h.counts.labWaiting === 1 ? 'is' : 'are'} waiting to be verified. Entering the blood type verifies them, and they can then get alerts.</p><a class="btn-secondary w-auto px-6" href="/facility/{id}/lab-results">Enter results</a></section>
		{/if}
	{:else}
		<p class="card p-8 text-center text-muted">Could not load the home screen.</p>
	{/if}
</FacilityShell>
