<script lang="ts">
	import type { Snippet } from 'svelte'
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import { STATUS } from '$lib/facility-status'
	import Icon from './Icon.svelte'
	import Logo from './Logo.svelte'
	import type { MyFacilityView } from '@damu/shared-types'

	let { f, active = 'status', width = 'wide', children }: { width?: 'narrow' | 'mid' | 'wide'; f: Pick<MyFacilityView, 'id' | 'name' | 'status' | 'role'> & { town?: string } | null; active?: string; children: Snippet } = $props()
	const user = $derived(auth.user!)
	const isAdmin = $derived(f?.role === 'admin')

	// The attendant tools (requests, calls, check-in...) arrive in later phases; they show as disabled until then.
	const items = $derived(
		[
			{ key: 'home', label: 'Home', href: f?.status === 'verified' ? `/facility/${f.id}/home` : undefined, icon: 'home' },
			{ key: 'status', label: 'Facility status', href: f ? `/facility/${f.id}?status=1` : undefined, icon: 'shield' },
			{ key: 'requests', label: 'Requests', href: f ? `/facility/${f.id}/requests` : undefined, icon: 'clipboard' },
			{ key: 'calls', label: 'Calls', href: f ? `/facility/${f.id}/calls` : undefined, icon: 'bell' },
			{ key: 'donor-requests', label: 'Donor requests', href: f ? `/facility/${f.id}/donor-requests` : undefined, icon: 'user' },
			{ key: 'checkin', label: 'Check-in', href: f ? `/facility/${f.id}/checkin` : undefined, icon: 'check' },
			{ key: 'drives', label: 'Blood drives', icon: 'calendar' },
			{ key: 'donors', label: 'Donors', href: f ? `/facility/${f.id}/donors` : undefined, icon: 'heart', admin: true },
			{ key: 'attendants', label: 'Attendants', href: f ? `/facility/${f.id}/attendants` : undefined, icon: 'user', admin: true },
			{ key: 'profile', label: 'Facility profile', href: f ? `/facility/${f.id}/profile` : undefined, icon: 'building', admin: true },
		].filter((i) => !i.admin || isAdmin) as { key: string; label: string; href?: string; icon: string }[],
	)
	const tabs = $derived(items.filter((i) => i.href))

	async function logout() {
		await auth.logout()
		await goto('/login')
	}
</script>

<aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-rose-100 bg-white md:flex">
	<a href="/" class="inline-flex px-6 pb-4 pt-6 text-rose-600"><Logo class="h-9" /></a>
	<div class="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-rose-50 p-3">
		<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white"><Icon name="building" class="h-5 w-5" /></span>
		<span class="min-w-0 leading-5"><span class="block truncate text-[15px] font-bold">{f?.name ?? 'Facility'}</span>{#if f}{#if f.status === 'verified'}<span class="block truncate text-[13px] text-muted">Facility {f.role}{f.town ? ` · ${f.town}` : ''}</span>{:else}<span class="badge {STATUS[f.status][0]} mt-0.5 !px-2 !py-0 text-[11px]">{STATUS[f.status][1]}</span>{/if}{/if}</span>
	</div>
	<nav aria-label="Facility" class="flex flex-1 flex-col gap-1 overflow-y-auto px-4">
		{#each items as i}
			{#if i.href}
				<a href={i.href} aria-current={active === i.key ? 'page' : undefined} class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 {active === i.key ? 'bg-rose-50 text-red-700' : 'text-ink'}"><Icon name={i.icon} />{i.label}</a>
			{:else}
				<span aria-disabled="true" title="Coming soon" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-muted/70"><Icon name={i.icon} />{i.label}</span>
			{/if}
		{/each}
	</nav>
	<div class="flex flex-col gap-1 border-t border-rose-100 p-4">
		<p class="truncate px-3.5 pb-1 text-[13px] text-muted">{user.name}</p>
		{#if user.canDonate}<a href="/dashboard" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-ink hover:bg-rose-50"><Icon name="drop" />My donor account</a>{/if}
		<button type="button" onclick={logout} class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-left text-[15px] font-semibold text-ink hover:bg-rose-50"><Icon name="logout" />Log out</button>
	</div>
</aside>

<div class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rose-100 bg-white px-4 md:hidden">
	<a href="/" class="text-rose-600"><Logo class="h-8" /></a>
	<button type="button" onclick={logout} class="link h-11 px-2 text-sm">Log out</button>
</div>
<nav aria-label="Facility" class="fixed inset-x-0 bottom-0 z-30 grid border-t border-rose-100 bg-white md:hidden" style="grid-template-columns: repeat({Math.max(tabs.length, 1)}, 1fr)">
	{#each tabs as i}
		<a href={i.href} class="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold {active === i.key ? 'text-rose-600' : 'text-muted'}"><Icon name={i.icon} class="h-6 w-6" />{i.label.replace('Facility ', '')}</a>
	{/each}
</nav>

<main class="min-h-screen bg-rose-50 pb-24 md:pb-0 md:pl-64">
	<div class="mx-auto flex w-full {width === 'narrow' ? 'max-w-3xl' : width === 'mid' ? 'max-w-4xl' : 'max-w-5xl'} flex-col gap-6 px-5 py-8 md:px-8 md:py-12">
		{@render children()}
	</div>
</main>
