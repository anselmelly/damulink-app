<script lang="ts">
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
	let error = $state<{ title: string; text: string } | null>(null)
	let busy = $state(false)

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = null
		busy = true
		try {
			await auth.login(email.trim(), password)
			const to = page.url.searchParams.get('redirect')
			await goto(to && to.startsWith('/') && !to.startsWith('//') ? to : '/choose-path')
		} catch (err) {
			if (err instanceof ApiError && err.code === 'invalid_credentials') error = { title: 'Email or password is not right.', text: ' Check them and try again, or reset your password.' }
			else if (err instanceof ApiError && (err.status === 429 || err.status === 403)) error = { title: err.message, text: '' }
			else error = { title: err instanceof ApiError ? err.message : 'Something went wrong.', text: '' }
		} finally {
			busy = false
		}
	}
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
			<button type="submit" class="btn-primary" disabled={busy || !email || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
		</form>

		<div class="mt-4 flex flex-col gap-3 text-center">
			<span class="text-[15px] leading-[22px] text-muted">New to {BRAND.name}?</span>
			<a href="/create-account" class="btn-secondary">Create a donor account</a>
			<p class="mt-2 text-[13px] leading-[19px] text-muted md:hidden">Patient details are never shown publicly, and alerts reach only donors who opted in.</p>
		</div>
	</div>
</AuthShell>
