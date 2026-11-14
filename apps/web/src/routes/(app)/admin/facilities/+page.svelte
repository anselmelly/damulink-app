<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { shortDate, STATUS } from '$lib/facility-status'
	import AdminShell from '$lib/ui/AdminShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { AdminFacilityRow } from '@damu/shared-types'

	let rows = $state<AdminFacilityRow[]>([])
	let loaded = $state(false)
	let error = $state('')
	let q = $state('')
	let status = $state('')
	let timer: ReturnType<typeof setTimeout>

	async function load() {
		if (!auth.user?.isSuperAdmin) return void (loaded = true)
		try {
			const qs = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(status ? { status } : {}) })
			rows = await auth.call<AdminFacilityRow[]>(`/admin/facilities?${qs}`)
			error = ''
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not load facilities.'
		}
		loaded = true
	}
	onMount(load)
	// search as you type, after a short pause
	$effect(() => {
		void q
		void status
		clearTimeout(timer)
		timer = setTimeout(load, 250)
		return () => clearTimeout(timer)
	})
	const title = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
</script>

<svelte:head><title>Facilities | {BRAND.name}</title></svelte:head>

<AdminShell active="facilities">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Facilities</h1>
		<p class="text-base leading-6 text-muted">Every facility, whatever its status. Open one to review or suspend it.</p>
	</header>

	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

	<div class="grid gap-3 sm:grid-cols-[1fr_220px]">
		<input type="search" bind:value={q} placeholder="Search by name, town, county or license" aria-label="Search facilities" class="field-input" />
		<select bind:value={status} aria-label="Status" class="field-input">
			<option value="">All statuses</option>
			{#each Object.entries(STATUS) as [k, [, l]]}<option value={k}>{l}</option>{/each}
		</select>
	</div>

	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if rows.length === 0}
		<div class="card p-10 text-center text-[15px] text-muted">No facility matches.</div>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each rows as r}
				<li><a href="/admin/facilities/{r.id}" class="card flex flex-col gap-2 p-4 hover:bg-rose-50 sm:flex-row sm:items-center sm:justify-between">
					<span class="flex flex-col"><span class="font-bold">{r.name}</span><span class="text-[13px] text-muted">{r.town}, {r.county} · {title(r.type)}{r.licenseNumber ? ` · ${r.licenseNumber}` : ''}{r.submittedAt ? ` · submitted ${shortDate(r.submittedAt)}` : ''}</span></span>
					<span class="flex items-center gap-2">{#if r.duplicateLicense}<span class="badge badge-warn">Same license as another</span>{/if}<span class="badge {STATUS[r.status][0]}">{STATUS[r.status][1]}</span></span>
				</a></li>
			{/each}
		</ul>
	{/if}
</AdminShell>
