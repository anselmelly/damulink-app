<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { apiFetch, ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const token = $derived(page.url.searchParams.get('token') ?? '')
	let view = $state<'waiting' | 'checking' | 'done' | 'expired' | 'invalid'>('waiting')
	let note = $state('')
	let busy = $state(false)

	onMount(async () => {
		if (!token) return
		view = 'checking'
		try {
			await apiFetch('/auth/verify-email', { body: { token } })
			view = 'done'
			await auth.init()
			if (auth.user) await auth.reload().catch(() => {})
		} catch (err) {
			view = err instanceof ApiError && err.code === 'token_expired' ? 'expired' : 'invalid'
		}
	})

	async function resend() {
		note = ''
		busy = true
		try {
			const r = await auth.call<{ alreadyVerified?: true } | undefined>('/auth/resend-email', { method: 'POST', body: {} })
			note = r?.alreadyVerified ? 'Your email is already verified.' : 'We sent a new link.'
			if (r?.alreadyVerified) await auth.reload()
		} catch (err) {
			note = err instanceof ApiError && err.status === 401 ? 'Log in to ask for a new link.' : err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Verify email | {BRAND.name}</title></svelte:head>

<AuthShell>
	{#if view === 'checking'}
		<p class="text-base text-muted" role="status">Checking your link…</p>
	{:else if view === 'done'}
		<div class="flex flex-col">
			<div class="flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white"><Icon name="check" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">Email verified</h1>
				<p class="text-base leading-6 text-muted">Thank you. We will use this address for account notices and password resets.</p>
			</div>
			<a href="/dashboard" class="btn-primary mt-8">Continue</a>
		</div>
	{:else if view === 'expired' || view === 'invalid'}
		<div class="flex flex-col">
			<div class="flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-700"><Icon name="clock" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">{view === 'expired' ? 'This link has expired' : 'This link is not valid'}</h1>
				<p class="text-base leading-6 text-muted">{view === 'expired' ? 'Verification links work for 24 hours. We can send a new one.' : 'It may have been used already. Log in and ask for a new one.'}</p>
			</div>
			<button type="button" class="btn-primary mt-8" onclick={resend} disabled={busy}>Send a new link</button>
			{#if note}<p class="mt-4 text-center text-[15px] text-muted" role="status">{note}</p>{/if}
		</div>
	{:else}
		<div class="flex flex-col">
			<div class="flex flex-col gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Icon name="mail" class="h-[30px] w-[30px]" /></div>
				<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">Check your email</h1>
				<p class="text-base leading-6 text-muted">We sent a link{#if auth.user} to <strong class="font-bold text-ink">{auth.user.email}</strong>{/if}. Open it to verify your address.</p>
			</div>
			<div class="notice mt-6">
				<Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" />
				<p>You do not have to wait. You can keep using {BRAND.name} while your email is unverified.</p>
			</div>
			<a href="/dashboard" class="btn-primary mt-5">Continue</a>
			<button type="button" class="btn-secondary mt-3" onclick={resend} disabled={busy}>Resend the email</button>
			{#if note}<p class="mt-4 text-center text-[15px] text-muted" role="status">{note}</p>{/if}
		</div>
	{/if}
</AuthShell>
