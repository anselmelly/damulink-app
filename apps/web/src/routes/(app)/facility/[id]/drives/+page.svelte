<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { DRIVE_PHASE, dayOf, driveDay, monthOf } from '$lib/drives'
	import { driveHours, type DriveList, type DriveTab, type MyFacilityView } from '@damu/shared-types'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let data = $state<DriveList | null>(null)
	let tab = $state<DriveTab>('upcoming')
	let loaded = $state(false)
	const load = async () => (data = await auth.call<DriveList>(`/my-facilities/${id}/drives?tab=${tab}`))
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {}
		loaded = true
	})
	const pick = async (t: DriveTab) => {
		tab = t
		await load().catch(() => {})
	}
	const TABS: [DriveTab, string][] = [['upcoming', 'Upcoming'], ['today', 'Today'], ['past', 'Past']]
</script>

<svelte:head><title>Blood drives | {BRAND.name}</title></svelte:head>

<FacilityShell {f} width="mid" active="drives">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Blood drives</h1><p class="text-base leading-6 text-muted">Drives your facility runs for a school, church, company or other host.</p></div>
		<a href="/facility/{id}/drives/new" class="btn-primary flex !w-auto items-center gap-2 px-6"><Icon name="plus" />New drive</a>
	</header>
	<div class="flex gap-2 border-b border-rose-200" role="tablist">
		{#each TABS as [k, l]}<button type="button" role="tab" aria-selected={tab === k} onclick={() => pick(k)} class="-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-[15px] font-semibold {tab === k ? 'border-rose-600 text-red-700' : 'border-transparent text-muted hover:text-ink'}">{l}{#if data && k !== 'past'}<span class="rounded-full bg-rose-100 px-2 text-[12px] leading-5 text-red-700">{data.counts[k]}</span>{/if}</button>{/each}
	</div>
	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if !data?.items.length}
		<div class="card flex flex-col items-center gap-3 p-10 text-center"><span class="path-icon h-14 w-14"><Icon name="calendar" class="h-7 w-7" /></span><p class="text-muted">{tab === 'past' ? 'No past drives yet.' : 'No drives here yet.'} <a class="link" href="/facility/{id}/drives/new">Create one</a>.</p></div>
	{:else}
		<ul class="flex flex-col gap-4">
			{#each data.items as d (d.id)}
				<li><a href="/facility/{id}/drives/{d.id}" class="card flex items-center gap-5 p-5 hover:bg-rose-50">
					<span class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl {d.status === 'published' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}"><span class="text-[12px] font-bold leading-4">{monthOf(d.date)}</span><span class="text-[26px] font-extrabold leading-7">{dayOf(d.date)}</span></span>
					<span class="min-w-0 flex-1">
						<span class="flex flex-wrap items-center gap-2"><span class="text-lg font-bold">{d.host}</span><span class="badge {DRIVE_PHASE[d.phase]?.[0] ?? 'badge-neutral'}">{DRIVE_PHASE[d.phase]?.[1] ?? d.phase}</span></span>
						<span class="block text-[15px] text-muted">{driveDay(d.date)} · {driveHours(d.starts, d.ends)} · {d.venue}, {d.town}</span>
						<span class="block text-[13px] text-muted">{d.status === 'draft' ? 'Not published yet.' : `${d.interested} interested`}{d.target ? ` · target ${d.target} donors` : ''}</span>
					</span>
					<Icon name="chev-r" class="text-red-700" />
				</a></li>
			{/each}
		</ul>
	{/if}
</FacilityShell>
