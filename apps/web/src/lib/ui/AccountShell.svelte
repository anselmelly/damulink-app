<script lang="ts">
	import type { Snippet } from 'svelte'
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import Icon from './Icon.svelte'
	import Logo from './Logo.svelte'

	let { active = 'home', children }: { active?: string; children: Snippet } = $props()

	const user = $derived(auth.user!)
	const minor = $derived(!user.donorCode) // under 18: a shorter menu
	const initials = $derived(user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase())

	// `href` is set only for screens that exist; the rest show as "soon" until their phase is built.
	// `minorOk`: still shown to an account that cannot donate yet. `tab`: label on the phone's bottom bar ('' = not a tab).
	const all = [
		{ key: 'home', label: 'Dashboard', href: '/dashboard', icon: 'home', tab: 'Home', minorOk: true },
		{ key: 'calls', label: 'Calls for you', icon: 'heart', tab: 'Calls' },
		{ key: 'donate', label: 'Donate or get tested', href: '/donate', icon: 'drop', tab: 'Donate' },
		{ key: 'visits', label: 'Appointments', href: '/appointments', icon: 'calendar', tab: 'Visits' },
		{ key: 'alerts', label: 'Alerts', href: '/alerts', icon: 'bell', tab: '' },
		{ key: 'reminders', label: 'Reminders', href: '/reminders', icon: 'clock', tab: '' },
		{ key: 'request', label: 'Donation appeal', href: '/request', icon: 'plus', tab: '', minorOk: true },
		{ key: 'requests', label: 'My requests', href: '/requests', icon: 'clipboard', tab: 'Requests', minorOk: true },
		{ key: 'profile', label: 'Profile', href: '/profile', icon: 'user', tab: 'Profile', minorOk: true },
	] as { key: string; label: string; href?: string; icon: string; tab: string; minorOk?: boolean }[]
	const items = $derived(minor ? all.filter((i) => i.minorOk) : all)
	const tabs = $derived(items.filter((i) => i.tab))

	async function logout() {
		await auth.logout()
		await goto('/login')
	}
</script>

<aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-rose-100 bg-white md:flex">
	<a href="/dashboard" class="-ml-0 inline-flex px-6 pb-4 pt-6 text-rose-600"><Logo class="h-9" /></a>
	<div class="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-rose-50 p-3">
		<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700" aria-hidden="true">{initials}</span>
		<span class="min-w-0 leading-5"><span class="block truncate text-[15px] font-bold">{user.name}</span><span class="block truncate text-[13px] text-muted">{user.email}</span></span>
	</div>
	<nav aria-label="Account" class="flex flex-1 flex-col gap-1 overflow-y-auto px-4">
		{#each items as i}
			{#if i.href}
				<a href={i.href} aria-current={active === i.key ? 'page' : undefined} class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 {active === i.key ? 'bg-rose-50 text-red-700' : 'text-ink'}"><Icon name={i.icon} />{i.label}</a>
			{:else}
				<span aria-disabled="true" title="Coming soon" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-muted/70"><Icon name={i.icon} />{i.label}</span>
			{/if}
		{/each}
	</nav>
	<div class="flex flex-col gap-1 border-t border-rose-100 px-4 pb-2 pt-3">
		{#if user.managedFacilities.length}<p class="px-3.5 pb-1 text-[11px] font-bold uppercase tracking-[.12em] text-muted">Your facilities</p>{/if}
		{#each user.managedFacilities as f}
			<a href="/facility/{f.id}" aria-current={active === `facility-${f.id}` ? 'page' : undefined} class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2 text-[15px] font-semibold hover:bg-rose-50 {active === `facility-${f.id}` ? 'bg-rose-50 text-red-700' : 'text-ink'}"><Icon name="building" /><span class="min-w-0 truncate">{f.name}</span></a>
		{/each}
		<a href="/facility/new" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-ink hover:bg-rose-50"><Icon name="plus" />Add a facility</a>
		{#if user.isSuperAdmin}<a href="/admin/dashboard" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-red-700 hover:bg-rose-50"><Icon name="shield" />Super admin</a>{/if}
	</div>
	<div class="flex flex-col gap-1 border-t border-rose-100 p-4">
		<a href="/" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-ink hover:bg-rose-50"><Icon name="arrow" />Public site</a>
		<button type="button" onclick={logout} class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-left text-[15px] font-semibold text-ink hover:bg-rose-50"><Icon name="logout" />Log out</button>
	</div>
</aside>

<div class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rose-100 bg-white px-4 md:hidden">
	<a href="/dashboard" class="text-rose-600"><Logo class="h-8" /></a>
	<button type="button" onclick={logout} class="link h-11 px-2 text-sm">Log out</button>
</div>
<nav aria-label="Account" class="fixed inset-x-0 bottom-0 z-30 grid border-t border-rose-100 bg-white md:hidden" style="grid-template-columns: repeat({tabs.length}, 1fr)">
	{#each tabs as i}
		{#if i.href}
			<a href={i.href} class="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-pink-300 {active === i.key ? 'text-rose-600' : 'text-muted'}"><Icon name={i.icon} class="h-6 w-6" />{i.tab}</a>
		{:else}
			<span aria-disabled="true" class="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted/60"><Icon name={i.icon} class="h-6 w-6" />{i.tab}</span>
		{/if}
	{/each}
</nav>

<main class="min-h-screen bg-rose-50 pb-24 md:pb-0 md:pl-64">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 md:px-8 md:py-12">
		{@render children()}
	</div>
</main>
