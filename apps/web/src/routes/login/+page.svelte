<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PasswordInput from '$lib/ui/PasswordInput.svelte'
	import TextField from '$lib/ui/TextField.svelte'

	let email = $state('')
	let password = $state('')
	let facilityCode = $state('')
	let error = $state<{ title: string; text: string } | null>(null)
	let busy = $state(false)

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = null
		busy = true
		try {
			const facility = await auth.login(email.trim(), password, facilityCode)
			const to = page.url.searchParams.get('redirect')
			const user = auth.user!
			// a facility code opens the facility; without one a person with no donor details still lands where their work is
			const home = facility ? `/facility/${facility.id}` : !user.canDonate && user.managedFacilities.length === 1 ? `/facility/${user.managedFacilities[0].id}` : '/dashboard'
			await goto(to && to.startsWith('/') && !to.startsWith('//') ? to : home)
		} catch (err) {
			if (err instanceof ApiError && err.code === 'invalid_credentials') error = { title: 'Email, password or facility code is not right.', text: ' Check them and try again, or reset your password.' }
			else if (err instanceof ApiError && (err.status === 429 || err.status === 403)) error = { title: err.message, text: '' }
			else error = { title: err instanceof ApiError ? err.message : 'Something went wrong.', text: '' }
		} finally {
			busy = false
		}
	}
	// already signed in: there is nothing to do here
	onMount(async () => {
		await auth.init()
		if (auth.user) await goto('/dashboard', { replaceState: true })
	})
</script>

<svelte:head><title>Log in | {BRAND.name}</title></svelte:head>

<AuthShell>
	<div class="flex flex-col gap-5">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-[32px] font-extrabold leading-[38px] tracking-tight">Log in</h1>
			<p class="text-base leading-6 text-muted">Welcome back. Log in to answer calls, manage donations, or run your facility.</p>
		</div>

		{#if error}
			<div class="notice-error" role="alert">
				<Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />
				<p><strong class="font-bold">{error.title}</strong>{error.text}</p>
			</div>
		{/if}

		<form onsubmit={submit} class="flex flex-col gap-5">
			<TextField id="email" label="Email" type="email" autocomplete="email" placeholder="you@example.com" bind:value={email} />
			<PasswordInput id="password" label="Password" placeholder="Enter your password" bind:value={password}>
				{#snippet labelExtra()}<a href="/forgot-password" class="link text-sm leading-5">Forgot password?</a>{/snippet}
			</PasswordInput>
			<details class="group rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
				<summary class="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-red-700">Signing in to a facility? Add its code<Icon name="chev-d" class="h-5 w-5 transition group-open:rotate-180" /></summary>
				<div class="flex flex-col gap-2 pb-2 pt-2">
					<label for="facility-code" class="field-label">Facility code</label>
					<input id="facility-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="FC-R4F2-9K" bind:value={facilityCode} class="field-input uppercase" />
					<span class="field-help">With a code you open the facility side. Without one you open your donor account. The two are kept apart. Find the code on your facility's status page.</span>
				</div>
			</details>
			<button type="submit" class="btn-primary" disabled={busy || !email || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
		</form>

		<div class="mt-4 flex flex-col gap-3 text-center">
			<span class="text-[15px] leading-[22px] text-muted">New to {BRAND.name}?</span>
			<a href="/create-account" class="btn-secondary">Create a donor account</a>
			<a href="/register-facility" class="link text-[15px]">Register a medical facility or blood bank</a>
			<p class="mt-2 text-[13px] leading-[19px] text-muted md:hidden">Patient details are never shown publicly, and alerts reach only donors who opted in.</p>
		</div>
	</div>
</AuthShell>
