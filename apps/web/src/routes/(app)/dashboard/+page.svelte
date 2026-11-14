<script lang="ts">
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const user = $derived(auth.user!)
	const first = $derived(user.name.split(' ')[0])
	const home = $derived(user.facilities[0])
	const canDonate = $derived(user.canDonate)
	// Blood type is recorded by a medical facility (a later phase), so for now every donor is "registered, not verified yet".
	const steps = $derived([
		{ done: user.phoneVerified, text: user.phoneVerified ? 'Account and phone verified' : 'Verify your phone' },
		{ done: false, text: 'Visit a medical facility for a test or donation' },
		{ done: false, text: 'Blood type recorded, alerts start' },
	])
	const firstOpen = $derived(steps.findIndex((s) => !s.done))
</script>

<svelte:head><title>Dashboard | {BRAND.name}</title></svelte:head>

<AccountShell active="home">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Hello, {first}</h1>
		<p class="text-base leading-6 text-muted">{canDonate ? `Welcome to ${BRAND.name}. One step left before you can get alerts.` : `Welcome to ${BRAND.name}.`}</p>
	</header>

	{#if !user.phoneVerified}
		<div class="notice"><Icon name="phone" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Your phone is not verified yet. <a href="/verify-phone" class="link">Verify it</a> to get alerts and request blood.</p></div>
	{/if}
	{#if !user.emailVerified}
		<div class="notice"><Icon name="mail" class="mt-px h-[22px] w-[22px] text-red-700" /><p>We sent a link to <strong class="font-bold">{user.email}</strong>. Open it to verify your email when you can. <a href="/verify-email" class="link">Resend</a></p></div>
	{/if}

	{#if canDonate}
		<section class="card overflow-hidden">
			<div class="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-8">
				<div class="flex items-start gap-4">
					<span class="path-icon h-14 w-14"><Icon name="drop" class="h-7 w-7" /></span>
					<div class="flex flex-col gap-1.5">
						<span class="badge bg-amber-50 text-amber-900 self-start">Registered</span>
						<h2 class="text-[22px] font-extrabold leading-7 tracking-tight">Not verified yet</h2>
						<p class="max-w-lg text-[15px] leading-[22px] text-muted">A medical facility has to confirm your blood type before we can match you to calls. A blood type test or your first donation does that.</p>
					</div>
				</div>
				<div class="flex shrink-0 flex-col gap-2 md:w-60">
					<span class="btn-primary opacity-60" aria-disabled="true">Get verified</span>
					<span class="text-center text-[13px] text-muted">Coming soon</span>
				</div>
			</div>
			<ol class="grid gap-px border-t border-rose-200 bg-rose-200 sm:grid-cols-3">
				{#each steps as s, i}
					<li class="flex items-center gap-3 bg-white px-6 py-4 {i > firstOpen ? 'text-muted' : ''}">
						{#if s.done}
							<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white"><Icon name="check" class="h-4 w-4" /></span>
						{:else}
							<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-sm font-extrabold {i === firstOpen ? 'border-rose-600 text-rose-600' : 'border-rose-200'}">{i + 1}</span>
						{/if}
						<span class="text-sm font-semibold leading-5">{s.text}</span>
					</li>
				{/each}
			</ol>
		</section>
	{:else}
		<section class="card flex items-start gap-4 p-6 md:p-8">
			<span class="path-icon h-14 w-14"><Icon name="drop" class="h-7 w-7" /></span>
			<div class="flex flex-col gap-1.5">
				<h2 class="text-[22px] font-extrabold leading-7 tracking-tight">You can donate from your 18th birthday</h2>
				<p class="max-w-lg text-[15px] leading-[22px] text-muted">Until then you can still ask a medical facility to share a call for someone you know.</p>
			</div>
		</section>
	{/if}

	<div class="grid gap-6 md:grid-cols-2">
		{#if user.donorCode}
			<section class="card flex flex-col gap-4 p-6">
				<div class="flex items-center justify-between gap-3"><h2 class="text-lg font-bold">Your donor code</h2><Icon name="lock" class="h-5 w-5 text-muted" /></div>
				<p class="rounded-xl bg-rose-50 py-5 text-center text-[32px] font-extrabold tracking-[.12em] text-red-700" aria-label="Donor code {user.donorCode.split('').join(' ')}">{user.donorCode}</p>
				<p class="text-sm leading-5 text-muted">Show this at the facility so attendants can find you. Only you can see it.</p>
			</section>
		{/if}

		<section class="card flex flex-col gap-4 p-6">
			<h2 class="text-lg font-bold">Your home facility</h2>
			{#if home}
				<div class="flex items-start gap-3">
					<span class="path-icon"><Icon name="building" class="h-6 w-6" /></span>
					<div class="leading-6"><p class="font-bold">{home.name}</p></div>
				</div>
				<p class="text-sm leading-5 text-muted">Calls from this facility reach you first, then calls from nearby ones.</p>
			{:else}
				<p class="text-[15px] leading-[22px] text-muted">You have not chosen a home facility yet. Alerts start from your home facility and widen outward.</p>
			{/if}
		</section>

		<section class="card flex flex-col gap-3 p-6">
			<h2 class="text-lg font-bold">Alerts</h2>
			<p class="text-sm leading-5 text-muted">You will start receiving alerts once you are verified and eligible. Alert settings arrive soon.</p>
		</section>

		<section class="card flex flex-col gap-3 p-6">
			<h2 class="text-lg font-bold">Need blood for someone?</h2>
			<p class="text-[15px] leading-[22px] text-muted">Ask a medical facility to confirm and share a call for a patient you know. You do not need to be verified.</p>
			<span class="btn-secondary !h-11 opacity-60" aria-disabled="true">Coming soon</span>
		</section>
	</div>
</AccountShell>
