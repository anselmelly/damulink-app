<script lang="ts">
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const user = $derived(auth.user!)
	let copied = $state(false)
	let confirming = $state(false)
	let changed = $state(false)
	let busy = $state(false)
	let error = $state('')

	async function copy() {
		try {
			await navigator.clipboard.writeText(user.donorCode ?? '')
			copied = true
			setTimeout(() => (copied = false), 2000)
		} catch {
			error = 'Could not copy. Select the code and copy it by hand.'
		}
	}

	async function regenerate() {
		error = ''
		busy = true
		try {
			await auth.call('/me/donor-code/regenerate', { method: 'POST', body: {} })
			await auth.reload()
			changed = true
			confirming = false
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Donor code | {BRAND.name}</title></svelte:head>

<AccountShell active="home">
	<a href="/dashboard" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Dashboard</a>

	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Your donor code</h1>
		<p class="text-base leading-6 text-muted">This is how a medical facility finds you. It is private to you.</p>
	</header>

	{#if !user.donorCode}
		<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Donor codes are for donors aged 18 and over. You will get one on your 18th birthday.</p></div>
	{:else}
		{#if changed}
			<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">New code created.</strong> The old code no longer works. Tell the facility if you already gave it to them.</p></div>
		{/if}
		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		<section class="card flex flex-col items-center gap-5 p-8 text-center md:p-12">
			<span class="eyebrow">Donor code</span>
			<p class="text-[40px] font-extrabold leading-none tracking-[.12em] text-red-700 md:text-[56px]">{user.donorCode}</p>
			<div class="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
				<button type="button" onclick={copy} class="btn-primary"><Icon name="copy" class="h-5 w-5" />{copied ? 'Copied' : 'Copy code'}</button>
			</div>
			<p class="max-w-md text-sm leading-5 text-muted">Do not post it online or send it in a group. If it gets shared by mistake, make a new one below.</p>
		</section>

		<section class="card flex flex-col gap-4 p-6 md:p-8">
			<h2 class="text-xl font-bold">At the facility</h2>
			<ol class="flex flex-col gap-4">
				{#each ['Tell the attendants your donor code, or show this screen.', 'They see your name and whether you are likely eligible to give today.', 'After your visit, they record your blood type, and you become verified so you can get alerts.'] as step, i}
					<li class="flex items-start gap-4"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700">{i + 1}</span><p class="pt-1 text-[15px] leading-[22px]">{step}</p></li>
				{/each}
			</ol>
		</section>

		<section class="card flex flex-col gap-4 p-6 md:p-8">
			<div><h2 class="text-lg font-bold">Code shared by mistake?</h2><p class="mt-1 text-[15px] leading-[22px] text-muted">Make a new code. The old one stops working right away.</p></div>
			{#if !confirming}
				<button type="button" onclick={() => (confirming = true)} class="btn-secondary sm:!w-auto sm:self-start sm:px-8">Make a new code</button>
			{:else}
				<div class="notice-error"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Replace {user.donorCode}?</strong> Your history and blood type stay on your account, but the old code stops working.</p></div>
				<div class="grid gap-3 sm:grid-cols-2">
					<button type="button" onclick={() => (confirming = false)} class="btn-secondary">Keep my code</button>
					<button type="button" onclick={regenerate} disabled={busy} class="btn-primary">{busy ? 'Making…' : 'Yes, make a new code'}</button>
				</div>
			{/if}
		</section>
	{/if}
</AccountShell>
