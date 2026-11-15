<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { ago, plural } from '$lib/requests'
	import Icon from '$lib/ui/Icon.svelte'
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
	const first = $derived(auth.user?.name.split(' ')[0] ?? '')
	const hr = Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }))
	const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'
	const tiles = $derived(h ? [['Requests to review', h.counts.toReview, 'requests'], ['Active calls', h.counts.activeCalls, 'calls'], ['Donor requests to follow up', h.counts.followUp, 'donor-requests'], ['Visits today', h.counts.visitsToday, 'donor-requests?tab=scheduled']] : [])
</script>

<svelte:head><title>Home | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="home">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{greeting}, {first}</h1>
			<p class="text-base leading-6 text-muted">{today} · {f?.name ?? ''}</p>
		</div>
		<div class="flex gap-3">
			<a class="btn-secondary flex !w-auto items-center gap-2 px-5" href="/facility/{id}/requests/new"><Icon name="plus" />New request</a>
			<a class="btn-secondary flex !w-auto items-center gap-2 px-5" href="/facility/{id}/walkin"><Icon name="user" />Walk-in</a>
		</div>
	</header>
	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if h}
		<form class="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end" onsubmit={(e) => { e.preventDefault(); if (code.trim()) void goto(`/facility/${id}/checkin?code=${encodeURIComponent(code.trim())}`) }}>
			<div class="flex flex-1 flex-col gap-2"><label for="code" class="field-label">Check in a donor by code</label><input id="code" bind:value={code} placeholder={`${BRAND.codePrefix}-XXXX-XX`} class="field-input text-xl tracking-wider" autocomplete="off" /></div>
			<button class="btn-primary sm:!w-auto sm:px-8" disabled={!code.trim()}>Find donor</button>
		</form>
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
			{#each tiles as [label, n, to]}<a href="/facility/{id}/{to}" class="card flex flex-col gap-1 p-5 hover:bg-rose-50"><span class="text-[34px] font-extrabold leading-10 text-rose-600">{n}</span><span class="text-base leading-5">{label}</span></a>{/each}
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<section class="card flex flex-col gap-4 p-6" aria-labelledby="w-h">
				<div class="flex items-center justify-between"><h2 id="w-h" class="text-xl font-bold">Requests waiting</h2><a class="link text-[15px]" href="/facility/{id}/requests">See all</a></div>
				{#if !h.waiting.length}<p class="text-muted">Nothing is waiting for review.</p>{:else}
					<ul class="flex flex-col divide-y divide-rose-100">{#each h.waiting as r (r.id)}<li><a href="/facility/{id}/requests/{r.id}" class="flex items-center gap-4 py-3"><BloodChip type={r.bloodType} /><span class="min-w-0 flex-1"><span class="block font-bold">{r.number} · {plural(r.units, 'unit')}</span><span class="block text-[13px] text-muted">{r.ref} · {ago(r.at)}</span></span>{#if r.urgency !== 'normal'}<span class="badge badge-urgent">{r.urgency === 'surge' ? 'Surge' : 'Urgent'}</span>{/if}</a></li>{/each}</ul>
				{/if}
			</section>

			<section class="card flex flex-col gap-4 p-6" aria-labelledby="c-h">
				<div class="flex items-center justify-between"><h2 id="c-h" class="text-xl font-bold">Active calls</h2><a class="link text-[15px]" href="/facility/{id}/calls">Manage</a></div>
				{#if !h.calls.length}<p class="text-muted">No live calls.</p>{:else}
					<ul class="flex flex-col gap-5">{#each h.calls as c (c.id)}
						<li><a href="/facility/{id}/calls/{c.id}" class="flex flex-col gap-2">
							<span class="flex items-center gap-4"><BloodChip type={c.bloodType} /><span class="min-w-0 flex-1"><span class="block font-bold">{c.number}</span><span class="block text-[13px] text-muted">{plural(c.yes, 'donor')} said YES</span></span><span class="font-semibold">{c.donated} of {c.needed}</span></span>
							<span class="flex h-2.5 overflow-hidden rounded-full bg-rose-100"><span class="bg-emerald-600" style="width:{Math.min(100, (c.donated / Math.max(1, c.needed)) * 100)}%"></span><span class="bg-rose-400" style="width:{Math.min(100 - (c.donated / Math.max(1, c.needed)) * 100, (c.scheduled / Math.max(1, c.needed)) * 100)}%"></span></span>
						</a></li>{/each}</ul>
					<p class="flex gap-4 text-[13px] text-muted"><span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-emerald-600"></span>Donated</span><span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-rose-400"></span>Scheduled</span></p>
				{/if}
			</section>

			<section class="card flex flex-col gap-4 p-6" aria-labelledby="v-h">
				<div class="flex items-center justify-between"><h2 id="v-h" class="text-xl font-bold">Today's visits</h2><a class="link text-[15px]" href="/facility/{id}/donor-requests?tab=scheduled">All</a></div>
				{#if !h.visits.length}<p class="text-muted">No visits booked today.</p>{:else}
					<ul class="flex flex-col divide-y divide-rose-100">{#each h.visits as v (v.id)}<li class="flex items-center gap-4 py-3"><span class="w-14 font-bold">{hour(v.at)}</span><span class="min-w-0 flex-1"><span class="block font-semibold">{v.name}</span><span class="block text-[13px] text-muted">{v.kind === 'donate' ? 'Donation' : 'Blood type test'}</span></span><span class="badge {v.checkedIn ? 'badge-ok' : 'badge-neutral'}">{v.checkedIn ? 'Checked in' : 'Expected'}</span></li>{/each}</ul>
				{/if}
			</section>

			{#if h.counts.labWaiting}
				<section class="card flex flex-col gap-3 self-start p-6">
					<div class="flex items-center justify-between"><h2 class="text-xl font-bold">Lab results to enter</h2><a class="link text-[15px]" href="/facility/{id}/lab-results">Enter</a></div>
					<p class="text-muted">{plural(h.counts.labWaiting, 'donor')} gave a sample and {h.counts.labWaiting === 1 ? 'is' : 'are'} waiting to be verified. Entering the blood type verifies them, and they can then get alerts.</p>
					<a class="btn-secondary" href="/facility/{id}/lab-results">Enter results</a>
				</section>
			{/if}
		</div>
	{:else}
		<p class="card p-8 text-center text-muted">Could not load the home screen.</p>
	{/if}
</FacilityShell>
