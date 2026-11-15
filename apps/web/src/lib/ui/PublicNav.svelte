<script lang="ts">
	import Icon from './Icon.svelte'
	import Logo from './Logo.svelte'
	import { BRAND } from '$lib/brand'
	import { auth } from '$lib/auth.svelte'

	const items = [
		{ label: 'Calls for blood', href: '/calls' },
		{ label: 'Blood drives', href: '/drives' },
		{ label: 'How it works', href: '/#how' },
		{ label: 'For medical facilities', href: '/#facilities' },
	]
	let open = $state(false)
</script>

<header class="sticky top-0 z-30 border-b border-rose-100 bg-white/95 backdrop-blur">
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
		<a href="/" class="-ml-2 inline-flex flex-col items-start rounded-lg text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300">
			<Logo />
			<span class="mt-0.5 pl-2 text-[9px] font-bold uppercase leading-none tracking-[.15em] text-muted md:text-[10px]">{BRAND.tagline}</span>
		</a>
		<nav aria-label="Main" class="hidden items-center gap-1 md:flex">
			{#each items as i}<a href={i.href} class="rounded-lg px-3.5 py-2 text-[15px] font-semibold text-ink hover:bg-rose-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300">{i.label}</a>{/each}
		</nav>
		<div class="hidden items-center gap-4 md:flex">
			{#if auth.user}
				<a href="/dashboard" class="btn-primary !h-11 !w-auto px-5 text-[15px]">My account</a>
			{:else}
				<a href="/login" class="link rounded-lg px-1 py-2 text-[15px]">Log in</a>
				<a href="/create-account" class="btn-primary !h-11 !w-auto px-5 text-[15px]">Sign up</a>
			{/if}
		</div>
		<button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onclick={() => (open = !open)} class="flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 md:hidden">
			<Icon name={open ? 'x' : 'menu'} class="h-6 w-6" />
		</button>
	</div>
	{#if open}
		<div class="border-t border-rose-100 px-4 pb-5 pt-3 md:hidden">
			<nav aria-label="Main" class="flex flex-col">
				{#each items as i}<a href={i.href} onclick={() => (open = false)} class="rounded-lg px-3 py-3 text-base font-semibold text-ink hover:bg-rose-50">{i.label}</a>{/each}
			</nav>
			{#if auth.user}<div class="mt-3"><a href="/dashboard" class="btn-primary">My account</a></div>{:else}<div class="mt-3 grid grid-cols-2 gap-3"><a href="/login" class="btn-secondary">Log in</a><a href="/create-account" class="btn-primary">Sign up</a></div>{/if}
		</div>
	{/if}
</header>
