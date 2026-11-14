<script lang="ts">
	import { page } from '$app/state'
	import { apiFetch, ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PasswordInput from '$lib/ui/PasswordInput.svelte'

	const token = $derived(page.url.searchParams.get('token') ?? '')
	let password = $state('')
	let confirm = $state('')
	let view = $state<'form' | 'done' | 'expired'>('form')
	let busy = $state(false)
	let errors = $state<Record<string, string>>({})

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		errors = {}
		if (password.length < 8) return void (errors = { password: 'Use at least 8 characters' })
		if (password !== confirm) return void (errors = { confirm: 'The two passwords do not match' })
		busy = true
		try {
			await apiFetch('/auth/reset-password', { body: { token, password } })
			view = 'done'
		} catch (err) {
			if (err instanceof ApiError && (err.code === 'token_expired' || err.code === 'invalid_token')) view = 'expired'
			else if (err instanceof ApiError && err.fields.password) errors = { password: err.fields.password }
			else errors = { password: err instanceof ApiError ? err.message : 'Something went wrong.' }
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Choose a new password | {BRAND.name}</title></svelte:head>

<AuthShell>
	{#if view === 'done'}
		<div class="flex flex-col">
			<div class="flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white"><Icon name="check" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">Password changed</h1>
				<p class="text-base leading-6 text-muted">You can log in with your new password now. We also logged you out of other devices.</p>
			</div>
			<a href="/login" class="btn-primary mt-8">Log in</a>
		</div>
	{:else if view === 'expired' || !token}
		<div class="flex flex-col">
			<div class="flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-700"><Icon name="clock" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">This link has expired</h1>
				<p class="text-base leading-6 text-muted">Reset links work for 60 minutes and only once. Ask for a new one.</p>
			</div>
			<a href="/forgot-password" class="btn-primary mt-8">Send a new link</a>
		</div>
	{:else}
		<div class="flex flex-col">
			<div class="flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Icon name="lock" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">Choose a new password</h1>
				<p class="text-base leading-6 text-muted">Pick something you have not used on {BRAND.name} before.</p>
			</div>
			<form onsubmit={submit} class="mt-8 flex flex-col gap-5">
				<PasswordInput id="new-pw" label="New password" autocomplete="new-password" placeholder="At least 8 characters" bind:value={password} error={errors.password} />
				<PasswordInput id="confirm-pw" label="Confirm new password" autocomplete="new-password" placeholder="Type it again" bind:value={confirm} error={errors.confirm} />
				<button type="submit" class="btn-primary" disabled={busy || !password}>{busy ? 'Saving…' : 'Save new password'}</button>
			</form>
		</div>
	{/if}
</AuthShell>
