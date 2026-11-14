<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { BLOOD_CHOICES, REQUEST_STATUS, ago, plural } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { FacilityRequestList, MyFacilityView, RequestStatus } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let data = $state<FacilityRequestList>({ counts: {}, items: [] })
	let loaded = $state(false)
	let error = $state('')
	let tab = $state('pending')
	let q = $state('')
	let blood = $state('')

	// Each tab is one or more statuses; "Closed" folds in the two other ways a request ends.
	const TABS: [string, string, RequestStatus[]][] = [
		['pending', 'Pending', ['pending']],
		['needs_info', 'Asked', ['needs_info']],
		['confirmed', 'Confirmed offline', ['confirmed']],
		['approved', 'Approved', ['approved']],
		['published', 'Published', ['published']],
		['closed', 'Closed', ['closed', 'rejected', 'cancelled']],
	]
	const count = (statuses: RequestStatus[]) => statuses.reduce((n, s) => n + (data.counts[s] ?? 0), 0)

	let timer: ReturnType<typeof setTimeout> | undefined
	async function load() {
		const statuses = TABS.find(([k]) => k === tab)![2].join(',')
		const qs = new URLSearchParams({ status: statuses })
		if (q.trim()) qs.set('q', q.trim())
		if (blood) qs.set('bloodType', blood)
		try {
			data = await auth.call<FacilityRequestList>(`/my-facilities/${id}/requests?${qs}`)
			error = ''
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not load the requests.'
		}
		loaded = true
	}
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
		} catch {
			error = 'This facility was not found, or you are not on its team.'
			loaded = true
			return
		}
		await load()
	})
	// reload when the tab or filter changes; typing waits a moment
	$effect(() => {
		tab
		blood
		q
		if (!f) return
		clearTimeout(timer)
		timer = setTimeout(load, 250)
		return () => clearTimeout(timer)
	})
</script>

<svelte:head><title>Requests | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="requests">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Requests</h1>
			<p class="text-base leading-6 text-muted">Requests from the public for patients here, and ones you raise yourself.</p>
		</div>
		{#if f?.status === 'verified'}<a href="/facility/{id}/requests/new" class="btn-primary sm:!w-auto sm:px-6"><Icon name="plus" class="h-5 w-5" />New request</a>{/if}
	</header>

	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

	<nav aria-label="Request status" class="flex gap-5 overflow-x-auto border-b border-rose-200">
		{#each TABS as [k, label, statuses]}
			<button type="button" onclick={() => (tab = k)} class="-mb-px flex h-12 shrink-0 items-center border-b-[3px] px-1 text-[15px] {tab === k ? 'border-rose-600 font-bold text-red-700' : 'border-transparent font-semibold text-muted hover:text-ink'}">{label}<span class="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs">{count(statuses)}</span></button>
		{/each}
	</nav>

	<div class="flex flex-col gap-3 sm:flex-row">
		<div class="relative flex-1">
			<Icon name="search" class="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
			<input type="search" aria-label="Search requests" placeholder="Search by number, ward or requester" bind:value={q} class="field-input !pl-11" />
		</div>
		<select aria-label="Blood type" bind:value={blood} class="field-input sm:!w-44"><option value="">All types</option>{#each BLOOD_CHOICES as b}<option>{b}</option>{/each}</select>
	</div>

	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if data.items.length === 0}
		<div class="card flex flex-col items-center gap-3 p-10 text-center"><span class="path-icon h-14 w-14"><Icon name="clipboard" class="h-7 w-7" /></span><p class="font-bold">No requests here</p><p class="text-[15px] text-muted">{q || blood ? 'Nothing matches that search.' : 'New requests will show up in this list.'}</p></div>
	{:else}
		<div class="card hidden overflow-hidden md:block">
			<table class="w-full text-left text-[15px]">
				<thead class="bg-rose-50 text-[13px] text-muted"><tr><th class="px-6 py-3 font-semibold">Request</th><th class="px-4 py-3 font-semibold">Needed</th><th class="px-4 py-3 font-semibold">Where</th><th class="px-4 py-3 font-semibold">From</th><th class="px-4 py-3 font-semibold">Status</th><th class="px-6 py-3 font-semibold">Age</th></tr></thead>
				<tbody class="divide-y divide-rose-100">
					{#each data.items as r (r.id)}
						<tr class="hover:bg-rose-50/60">
							<td class="px-6 py-3"><a href="/facility/{id}/requests/{r.id}" class="link font-bold">{r.number}</a></td>
							<td class="px-4 py-3"><span class="flex items-center gap-2"><BloodChip type={r.bloodType} size="sm" />{plural(r.units, 'unit')}{#if r.urgency !== 'normal'}<span class="badge badge-urgent capitalize">{r.urgency}</span>{/if}</span></td>
							<td class="px-4 py-3">{r.patientRef}</td>
							<td class="px-4 py-3">{r.requesterName ?? 'Raised here'}</td>
							<td class="px-4 py-3"><span class="badge {REQUEST_STATUS[r.status][0]}">{REQUEST_STATUS[r.status][1]}</span></td>
							<td class="px-6 py-3 text-muted">{ago(r.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<ul class="flex flex-col gap-3 md:hidden">
			{#each data.items as r (r.id)}
				<li><a href="/facility/{id}/requests/{r.id}" class="card flex items-center gap-3 p-4"><BloodChip type={r.bloodType} /><span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="flex flex-wrap items-center gap-2"><span class="font-bold">{r.number}</span>{#if r.urgency !== 'normal'}<span class="badge badge-urgent capitalize">{r.urgency}</span>{/if}</span><span class="text-[13px] text-muted">{plural(r.units, 'unit')} · {r.patientRef} · {ago(r.createdAt)}</span><span class="badge {REQUEST_STATUS[r.status][0]} self-start">{REQUEST_STATUS[r.status][1]}</span></span><Icon name="chev-r" class="h-5 w-5 text-muted" /></a></li>
			{/each}
		</ul>
	{/if}
</FacilityShell>
