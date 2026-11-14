<script lang="ts">
	import { apiFetch, ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import TextField from '$lib/ui/TextField.svelte'

	let email = $state('')
	let sent = $state(false)
	let busy = $state(false)
	let error = $state('')

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = ''
		busy = true
		try {
			await apiFetch('/auth/forgot-password', { body: { email: email.trim() } })
			sent = true
		} catch (err) {
			error = err instanceof ApiError && err.fields.email ? err.fields.email : err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Reset password | {BRAND.name}</title></svelte:head>

<AuthShell>
	<div class="flex flex-col">
		<a href="/login" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Back to log in</a>

		{#if !sent}
			<div class="mt-6 flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Icon name="lock" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">Reset your password</h1>
				<p class="text-base leading-6 text-muted">Enter the email you signed up with. We will send you a link to choose a new password.</p>
			</div>
			<form onsubmit={submit} class="mt-8 flex flex-col gap-5">
				<TextField id="reset-email" label="Email" type="email" autocomplete="email" placeholder="you@example.com" bind:value={email} {error} />
				<button type="submit" class="btn-primary" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</button>
			</form>
		{:else}
			<div class="mt-6 flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Icon name="mail" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">Check your email</h1>
				<p class="text-base leading-6 text-muted">If an account exists for <strong class="font-bold text-ink">{email}</strong>, a reset link is on its way. It works for 60 minutes.</p>
			</div>
			<div class="notice mt-6">
				<Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" />
				<p>Did not get an email? Check your spam folder, then try again in a minute.</p>
			</div>
			<button type="button" class="btn-secondary mt-5" onclick={() => (sent = false)}>Use a different email</button>
		{/if}

		<p class="mt-8 text-center text-[15px] leading-[22px] text-muted">Remembered it? <a href="/login" class="link font-bold">Log in</a></p>
	</div>
</AuthShell>
