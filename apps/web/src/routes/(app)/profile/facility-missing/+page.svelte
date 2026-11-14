<script lang="ts">
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import TextField from '$lib/ui/TextField.svelte'

	let name = $state('')
	let town = $state('')
	let county = $state('')
	let sent = $state(false)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		errors = {}
		busy = true
		try {
			await auth.call('/me/facility-requests', { body: { name, town, county: county || undefined } })
			sent = true
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Facility not listed | {BRAND.name}</title></svelte:head>

<AccountShell active="profile">
	<a href="/profile#facilities" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Profile</a>

	{#if !sent}
		<header class="flex flex-col gap-1.5">
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">My facility is not listed</h1>
			<p class="text-base leading-6 text-muted">Tell us where you would like to donate. We will invite them to join {BRAND.name}.</p>
		</header>
		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}
		<form onsubmit={submit} class="card flex flex-col gap-5 p-6 md:p-8">
			<TextField id="fname" label="Facility name" placeholder="For example, Riverside Dispensary" bind:value={name} error={errors.name} />
			<div class="grid gap-5 sm:grid-cols-2">
				<TextField id="town" label="Town" placeholder="Thika" bind:value={town} error={errors.town} />
				<TextField id="county" label="County (optional)" placeholder="Kiambu" bind:value={county} />
			</div>
			<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>We do not contact the facility on your behalf. We only keep a list, so we know where donors want to join.</p></div>
			<button type="submit" class="btn-primary" disabled={busy || !name || !town}>{busy ? 'Sending…' : 'Send'}</button>
		</form>
	{:else}
		<div class="card flex flex-col items-center gap-4 p-8 text-center md:p-12">
			<span class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white"><Icon name="check" class="h-[30px] w-[30px]" /></span>
			<h1 class="text-[28px] font-extrabold leading-8 tracking-tight">Thank you, we have noted it</h1>
			<p class="max-w-md text-base leading-6 text-muted">{name}, {town} is on our list. In the meantime, pick the nearest listed facility as your home facility so you can still get verified.</p>
			<a href="/profile#facilities" class="btn-primary sm:!w-auto sm:px-8">Choose a home facility</a>
		</div>
	{/if}
</AccountShell>
