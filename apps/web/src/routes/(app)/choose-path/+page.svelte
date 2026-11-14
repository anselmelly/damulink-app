<script lang="ts">
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import Icon from '$lib/ui/Icon.svelte'
	import Logo from '$lib/ui/Logo.svelte'

	const user = $derived(auth.user!)
	const first = $derived(user.name.split(' ')[0])
	const initials = $derived(user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase())

	// The screens behind these cards arrive in later phases; until then they say so instead of leading nowhere.
	const paths = [
		{ icon: 'drop', title: 'Get verified as a donor', text: 'Book a blood type test or first donation. Once a medical facility confirms your blood type, you can get alerts.' },
		{ icon: 'clipboard', title: 'Request blood for someone', text: 'Ask a medical facility to confirm and share a call for a patient you know.' },
		{ icon: 'building', title: 'Add a facility', text: 'Register a medical facility or blood bank. We verify it before it can post calls.' },
	]

	async function logout() {
		await auth.logout()
		await goto('/login')
	}
</script>

<svelte:head><title>What would you like to do | {BRAND.name}</title></svelte:head>

<header class="border-b border-rose-100 bg-white">
	<div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
		<a href="/" class="-ml-2 inline-flex rounded-lg text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"><Logo class="h-9" /></a>
		<div class="flex items-center gap-3">
			<span class="hidden text-[15px] font-semibold sm:inline">{user.name}</span>
			<span class="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700" aria-hidden="true">{initials}</span>
			<button type="button" onclick={logout} class="link h-11 px-2 text-[15px]">Log out</button>
		</div>
	</div>
</header>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:py-16">
	{#if user.phoneVerified}
		<div class="flex items-center gap-3 rounded-2xl bg-rose-600 px-5 py-4 text-white">
			<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-rose-600"><Icon name="check" class="h-5 w-5" /></span>
			<p class="text-[15px] font-semibold leading-[22px]">Account created and phone verified. Welcome to {BRAND.name}, {first}.</p>
		</div>
	{:else}
		<div class="notice">
			<Icon name="phone" class="mt-px h-[22px] w-[22px] text-red-700" />
			<p>Your phone is not verified yet. <a href="/verify-phone" class="link">Verify it</a> to get alerts and request blood.</p>
		</div>
	{/if}

	<div class="flex flex-col gap-2">
		<h1 class="text-[32px] font-extrabold leading-[38px] tracking-tight md:text-[40px] md:leading-[46px]">What would you like to do?</h1>
		<p class="text-base leading-6 text-muted">You can do any of these later from your dashboard.</p>
	</div>

	{#if !user.emailVerified}
		<div class="notice">
			<Icon name="mail" class="mt-px h-[22px] w-[22px] text-red-700" />
			<p>We sent a link to <strong class="font-bold">{user.email}</strong>. Open it to verify your email when you can. <a href="/verify-email" class="link">Resend</a></p>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-3">
		{#each paths as p}
			<div class="path-card relative md:flex-col md:items-start md:gap-5 md:p-6" aria-disabled="true">
				<span class="path-icon md:h-14 md:w-14"><Icon name={p.icon} class="h-[26px] w-[26px]" /></span>
				<span class="flex min-w-0 flex-1 flex-col gap-1">
					<span class="path-title md:text-xl">{p.title}</span>
					<span class="path-text md:text-[15px] md:leading-[22px]">{p.text}</span>
				</span>
				<span class="badge badge-soft md:self-end">Coming soon</span>
			</div>
		{/each}
	</div>
</main>
