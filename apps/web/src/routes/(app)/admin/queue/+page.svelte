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
	let filter = $state<'all' | 'pending' | 'needs_info'>('all')

	onMount(async () => {
		if (!auth.user?.isSuperAdmin) return void (loaded = true)
		try {
			rows = await auth.call<AdminFacilityRow[]>('/admin/facilities?view=queue')
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not load the queue.'
		}
		loaded = true
	})
	const shown = $derived(filter === 'all' ? rows : rows.filter((r) => r.status === filter))
	const count = (s: string) => rows.filter((r) => r.status === s).length
	const title = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
</script>

<svelte:head><title>Verification queue | {BRAND.name}</title></svelte:head>

<AdminShell active="queue">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Verification queue</h1>
		<p class="text-base leading-6 text-muted">Oldest first. Check the details, record how you checked, then decide.</p>
	</header>

	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

	<div class="flex flex-wrap gap-2">
		{#each [['all', `All ${rows.length}`], ['pending', `Pending ${count('pending')}`], ['needs_info', `Needs info ${count('needs_info')}`]] as [k, l]}
			<button type="button" onclick={() => (filter = k as typeof filter)} class="flex h-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] px-4 text-[15px] font-semibold {filter === k ? 'border-rose-600 bg-rose-50 text-red-700' : 'border-field bg-white text-ink'}">{l}</button>
		{/each}
	</div>

	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if shown.length === 0}
		<div class="card flex flex-col items-center gap-3 p-10 text-center"><span class="path-icon h-16 w-16"><Icon name="check" class="h-8 w-8" /></span><h2 class="text-xl font-bold">Nothing waiting</h2><p class="text-[15px] text-muted">New facilities appear here as soon as they are submitted.</p></div>
	{:else}
		<section class="card hidden overflow-hidden md:block">
			<table class="w-full text-left text-[15px]">
				<thead class="border-b border-rose-200 bg-rose-50 text-[13px] font-bold uppercase tracking-wide text-muted"><tr><th class="px-6 py-3">Facility</th><th class="px-4 py-3">Type</th><th class="px-4 py-3">License</th><th class="px-4 py-3">Submitted</th><th class="px-4 py-3">Status</th></tr></thead>
				<tbody class="divide-y divide-rose-100">
					{#each shown as r}
						<tr class="hover:bg-rose-50">
							<td class="px-6 py-3"><a href="/admin/facilities/{r.id}" class="link block font-bold">{r.name}</a><span class="block text-[13px] text-muted">{r.town}</span></td>
							<td class="px-4 py-3 text-muted">{title(r.type)}</td>
							<td class="px-4 py-3"><span class="font-semibold">{r.licenseNumber}</span>{#if r.duplicateLicense}<span class="badge badge-warn ml-2">Same license as another</span>{/if}</td>
							<td class="px-4 py-3 text-muted">{shortDate(r.submittedAt)}</td>
							<td class="px-4 py-3"><span class="badge {STATUS[r.status][0]}">{STATUS[r.status][1]}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
		<ul class="flex flex-col gap-3 md:hidden">
			{#each shown as r}
				<li><a href="/admin/facilities/{r.id}" class="card flex flex-col gap-2 p-4"><span class="flex items-start justify-between gap-3"><span class="font-bold">{r.name}</span><span class="badge {STATUS[r.status][0]}">{STATUS[r.status][1]}</span></span><span class="text-[13px] text-muted">{r.town} · {title(r.type)} · {r.licenseNumber} · {shortDate(r.submittedAt)}</span>{#if r.duplicateLicense}<span class="badge badge-warn self-start">Same license as another</span>{/if}</a></li>
			{/each}
		</ul>
	{/if}
	<p class="text-[13px] text-muted">A license number shared by two facilities is flagged so you can look at both before approving.</p>
</AdminShell>
