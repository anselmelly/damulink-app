<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import AdminShell from '$lib/ui/AdminShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { AuditPage } from '@damu/shared-types'

	let data = $state<AuditPage | null>(null)
	let q = $state('')
	let group = $state('all')
	let pageNo = $state(1)
	let loaded = $state(false)
	let error = $state('')
	let timer: ReturnType<typeof setTimeout> | undefined
	async function load() {
		error = ''
		const qs = new URLSearchParams({ page: String(pageNo), group })
		if (q.trim()) qs.set('q', q.trim())
		try {
			data = await auth.call<AuditPage>(`/admin/audit?${qs}`)
		} catch {
			error = 'Could not load the log.'
		}
		loaded = true
	}
	onMount(load)
	const refine = () => {
		pageNo = 1
		clearTimeout(timer)
		timer = setTimeout(load, 300)
	}
	const go = (n: number) => {
		pageNo = n
		void load()
	}
	const at = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
	const last = $derived(data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1)
</script>

<svelte:head><title>Audit log | {BRAND.name}</title></svelte:head>

<AdminShell active="audit">
	<header class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Audit log</h1><p class="text-base leading-6 text-muted">Approvals, publications, confirmations and edits. Entries cannot be changed or deleted.</p></header>
	<form class="flex flex-col gap-3 sm:flex-row" onsubmit={(e) => e.preventDefault()}>
		<div class="relative flex-1"><Icon name="search" class="h-5 w-5 pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><input type="search" aria-label="Search the log" placeholder="Search by person, facility or request" bind:value={q} oninput={refine} class="field-input !pl-12" /></div>
		<select aria-label="Action" bind:value={group} onchange={refine} class="field-input sm:!w-52"><option value="all">All actions</option><option value="approvals">Approvals</option><option value="publications">Publications</option><option value="edits">Edits</option><option value="settings">Settings</option></select>
	</form>
	{#if error}<p class="notice-error" role="alert">{error}</p>{/if}
	{#if !loaded}<p class="text-muted" role="status">Loading…</p>
	{:else if data}
		{#if !data.items.length}<div class="card p-8 text-center text-muted">Nothing matches.</div>{:else}
			<section class="card hidden overflow-hidden md:block">
				<table class="w-full text-left text-[15px]">
					<thead class="border-b border-rose-200 bg-rose-50 text-[13px] font-bold uppercase tracking-wide text-muted"><tr><th class="px-6 py-3">When</th><th class="px-4 py-3">Who</th><th class="px-4 py-3">Action</th><th class="px-4 py-3">Detail</th></tr></thead>
					<tbody class="divide-y divide-rose-100">{#each data.items as r (r.id)}<tr><td class="whitespace-nowrap px-6 py-3 text-muted">{at(r.at)}</td><td class="px-4 py-3">{r.who}</td><td class="px-4 py-3 font-bold">{r.label}</td><td class="px-4 py-3 text-muted">{r.detail}</td></tr>{/each}</tbody>
				</table>
			</section>
			<ul class="flex flex-col gap-3 md:hidden">{#each data.items as r (r.id)}<li class="card flex flex-col gap-1 p-4"><p class="text-[13px] text-muted">{at(r.at)} · {r.who}</p><p class="font-bold">{r.label}</p>{#if r.detail}<p class="text-[15px] text-muted">{r.detail}</p>{/if}</li>{/each}</ul>
			<nav aria-label="Pages" class="flex items-center justify-between text-[15px]"><span class="text-muted">{(data.page - 1) * data.pageSize + 1} to {Math.min(data.page * data.pageSize, data.total)} of {data.total.toLocaleString('en-GB')}</span><span class="flex gap-2"><button type="button" class="btn-secondary !h-11 !w-auto px-5" disabled={data.page <= 1} onclick={() => go(data!.page - 1)}>Previous</button><button type="button" class="btn-secondary !h-11 !w-auto px-5" disabled={data.page >= last} onclick={() => go(data!.page + 1)}>Next</button></span></nav>
		{/if}
	{/if}
</AdminShell>
