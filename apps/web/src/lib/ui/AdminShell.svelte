<script lang="ts">
	import type { Snippet } from 'svelte'
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import Icon from './Icon.svelte'
	import Logo from './Logo.svelte'

	let { active = 'queue', children }: { active?: string; children: Snippet } = $props()
	let badges = $state<Record<string, number>>({})
	onMount(async () => {
		try {
			const d = await auth.call<{ counts: { toVerify: number; flagged: number } }>('/admin/dashboard')
			badges = { queue: d.counts.toVerify, misuse: d.counts.flagged }
		} catch {}
	})
	const user = $derived(auth.user!)
	const initials = $derived(user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase())

	// Only the screens that exist are links; the rest arrive in later phases.
	const items = [
		{ key: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', icon: 'home' },
		{ key: 'queue', label: 'Verification queue', href: '/admin/queue', icon: 'clipboard' },
		{ key: 'facilities', label: 'Facilities', href: '/admin/facilities', icon: 'building' },
		{ key: 'demand', label: 'Facility requests', icon: 'pin' },
		{ key: 'misuse', label: 'Misuse', href: '/admin/misuse', icon: 'alert' },
		{ key: 'audit', label: 'Audit log', href: '/admin/audit', icon: 'history' },
		{ key: 'settings', label: 'System settings', href: '/admin/settings', icon: 'sliders' },
		{ key: 'admins', label: 'Super admins', href: '/admin/admins', icon: 'users' },
	] as { key: string; label: string; href?: string; icon: string }[]

	async function logout() {
		await auth.logout()
		await goto('/login')
	}
</script>

<aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-rose-100 bg-white md:flex">
	<a href="/admin/dashboard" class="inline-flex px-6 pb-2 pt-6 text-rose-600"><Logo class="h-9" /></a>
	<p class="px-6 pb-4 text-[11px] font-bold uppercase tracking-[.14em] text-muted">Super admin</p>
	<div class="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-rose-50 p-3">
		<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700" aria-hidden="true">{initials}</span>
		<span class="min-w-0 leading-5"><span class="block truncate text-[15px] font-bold">{user.name}</span><span class="block truncate text-[13px] text-muted">{user.email}</span></span>
	</div>
	<nav aria-label="Admin" class="flex flex-1 flex-col gap-1 overflow-y-auto px-4">
		{#each items as i}
			{#if i.href}
				<a href={i.href} aria-current={active === i.key ? 'page' : undefined} class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 {active === i.key ? 'bg-rose-50 text-red-700' : 'text-ink'}"><Icon name={i.icon} /><span class="flex-1">{i.label}</span>{#if badges[i.key]}<span class="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">{badges[i.key]}</span>{/if}</a>
			{:else}
				<span aria-disabled="true" title="Coming soon" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-muted/70"><Icon name={i.icon} />{i.label}</span>
			{/if}
		{/each}
	</nav>
	<div class="flex flex-col gap-1 border-t border-rose-100 p-4">
		<a href="/dashboard" class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold text-ink hover:bg-rose-50"><Icon name="arrow" />My donor account</a>
		<button type="button" onclick={logout} class="flex h-11 items-center gap-3 rounded-xl px-3.5 text-left text-[15px] font-semibold text-ink hover:bg-rose-50"><Icon name="logout" />Log out</button>
	</div>
</aside>

<div class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rose-100 bg-white px-4 md:hidden">
	<a href="/admin/dashboard" class="text-rose-600"><Logo class="h-8" /></a>
	<nav class="flex items-center gap-1 text-sm font-semibold"><a href="/admin/dashboard" class="rounded-lg px-2 py-2 {active === 'dashboard' ? 'text-red-700' : 'text-ink'}">Home</a><a href="/admin/queue" class="rounded-lg px-2 py-2 {active === 'queue' ? 'text-red-700' : 'text-ink'}">Queue</a><a href="/admin/facilities" class="rounded-lg px-2 py-2 {active === 'facilities' ? 'text-red-700' : 'text-ink'}">Facilities</a><a href="/admin/misuse" class="rounded-lg px-2 py-2 {active === 'misuse' ? 'text-red-700' : 'text-ink'}">Misuse</a><a href="/admin/settings" class="rounded-lg px-2 py-2 {active === 'settings' ? 'text-red-700' : 'text-ink'}">Settings</a><a href="/dashboard" class="rounded-lg px-2 py-2 text-ink">Donor</a></nav>
</div>

<main class="min-h-screen bg-rose-50 md:pl-64">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8 md:py-12">
		{#if user.isSuperAdmin}
			{@render children()}
		{:else}
			<div class="notice-error" role="alert"><Icon name="lock" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">This page is for {BRAND.name} super admins.</strong> <a href="/dashboard" class="link">Back to your account</a></p></div>
		{/if}
	</div>
</main>
