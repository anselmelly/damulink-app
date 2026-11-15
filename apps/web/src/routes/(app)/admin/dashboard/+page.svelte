<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import AdminShell from '$lib/ui/AdminShell.svelte'
	import type { AdminDashboard } from '@damu/shared-types'

	let d = $state<AdminDashboard | null>(null)
	let loaded = $state(false)
	onMount(async () => {
		try {
			d = await auth.call<AdminDashboard>('/admin/dashboard')
		} catch {}
		loaded = true
	})
	const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' })
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' })
	const when = (iso: string) => {
		const dt = new Date(iso)
		const same = dt.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' }) === new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })
		return same ? dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : day(iso)
	}
	const attention = $derived(d ? [['Facilities to verify', d.counts.toVerify, '/admin/queue'], ['Flagged users', d.counts.flagged, '/admin/misuse']] as const : [])
	const totals = $derived(d ? [['Verified facilities', d.counts.facilitiesVerified], ['Donors', d.counts.donors], ['Open calls', d.counts.openCalls], ['Requests today', d.counts.requestsToday]] as const : [])
</script>

<svelte:head><title>Dashboard | {BRAND.name}</title></svelte:head>

<AdminShell active="dashboard">
	<header class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Dashboard</h1><p class="text-base leading-6 text-muted">{today}. What needs you today.</p></header>
	{#if !loaded}<p class="text-muted" role="status">Loading…</p>
	{:else if d}
		<section class="grid grid-cols-2 gap-4">
			{#each attention as [label, n, to]}<a href={to} class="card p-5 hover:bg-rose-50"><p class="text-[32px] font-extrabold leading-none tracking-tight {n ? 'text-red-700' : ''}">{n}</p><p class="mt-2 text-[15px] font-semibold text-muted">{label}</p></a>{/each}
		</section>
		<section class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{#each totals as [label, n]}<div class="card p-5"><p class="text-[32px] font-extrabold leading-none tracking-tight">{n.toLocaleString('en-GB')}</p><p class="mt-2 text-[15px] font-semibold text-muted">{label}</p></div>{/each}
		</section>
		<div class="grid items-start gap-6 lg:grid-cols-2">
			<section class="card flex flex-col gap-3 p-6">
				<div class="flex items-center justify-between"><h2 class="text-lg font-bold">Oldest in the queue</h2><a href="/admin/queue" class="link text-[15px]">See all</a></div>
				{#if !d.oldest.length}<p class="text-muted">Nothing is waiting for review.</p>{:else}
					<ul class="flex flex-col divide-y divide-rose-100">
						{#each d.oldest as o (o.id)}<li class="flex items-center justify-between gap-3 py-3"><span class="leading-5"><a href="/admin/facilities/{o.id}" class="link block text-[15px] font-bold">{o.name}</a><span class="block text-[13px] text-muted">{o.town}{o.submittedAt ? ` · submitted ${day(o.submittedAt)}` : ''}</span></span><span class="badge badge-warn">{o.status === 'needs_info' ? 'Needs info' : 'Pending'}</span></li>{/each}
					</ul>
				{/if}
			</section>
			<section class="card flex flex-col gap-3 p-6">
				<div class="flex items-center justify-between"><h2 class="text-lg font-bold">Recent activity</h2><a href="/admin/audit" class="link text-[15px]">Audit log</a></div>
				{#if !d.recent.length}<p class="text-muted">Nothing yet.</p>{:else}
					<ul class="flex flex-col divide-y divide-rose-100 text-[15px]">
						{#each d.recent as r (r.id)}<li class="flex gap-3 py-3"><span class="w-16 shrink-0 text-[13px] text-muted">{when(r.at)}</span><span class="leading-5">{r.who} · {r.label}{r.detail ? `: ${r.detail}` : ''}</span></li>{/each}
					</ul>
				{/if}
			</section>
		</div>
	{:else}<p class="card p-8 text-center text-muted">Could not load the dashboard.</p>{/if}
</AdminShell>
