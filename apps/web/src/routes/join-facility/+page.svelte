<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError, apiFetch } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PasswordInput from '$lib/ui/PasswordInput.svelte'
	import TextField from '$lib/ui/TextField.svelte'
	import type { InviteView } from '@damu/shared-types'

	const token = $derived(page.url.searchParams.get('token') ?? '')
	let invite = $state<InviteView | null>(null)
	let invalid = $state(false)
	let name = $state('')
	let phone = $state('')
	let password = $state('')
	let errors = $state<Record<string, string>>({})
	let error = $state('')
	let busy = $state(false)

	onMount(async () => {
		await auth.init()
		try {
			invite = await apiFetch<InviteView>(`/invites/${token}`)
		} catch {
			invalid = true
		}
	})
	const matches = $derived(!!auth.user && !!invite && auth.user.email.toLowerCase() === invite.email.toLowerCase())

	async function join(e: SubmitEvent) {
		e.preventDefault()
		errors = {}
		error = ''
		busy = true
		try {
			await auth.joinFacility(token, { name: name.trim(), phone: '254' + phone.replace(/\D/g, '').replace(/^0/, ''), password })
			await goto('/verify-phone')
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	async function accept() {
		error = ''
		busy = true
		try {
			const f = await auth.call<{ id: string }>(`/invites/${token}/accept`, { body: {} })
			await auth.reload()
			await goto(`/facility/${f.id}`)
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>{invite ? `Join ${invite.facilityName}` : 'Join a facility'} | {BRAND.name}</title></svelte:head>

<AuthShell
	brandTitle="Join your facility's team."
	brandText="You were invited to work on a facility's requests, calls, and donations. No donor details are needed."
	brandPoints={['Your email is already confirmed by the invite', 'Your actions are recorded under your own name', 'Sign in with your facility code to open the facility']}
	inner="max-w-[460px]"
>
	{#if invalid || !token}
		<div class="flex flex-col gap-4">
			<span class="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-700"><Icon name="clock" class="h-[30px] w-[30px]" /></span>
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight">This invitation is not valid</h1>
			<p class="text-base leading-6 text-muted">It may have expired, been used already, or been cancelled. Ask the facility admin to send a new one.</p>
			<a href="/login" class="btn-primary mt-4">Log in</a>
		</div>
	{:else if invite}
		<div class="flex flex-col gap-6">
			<div class="flex flex-col gap-1.5">
				<span class="badge badge-ok self-start">Verified medical facility</span>
				<h1 class="mt-2 text-[32px] font-extrabold leading-[38px] tracking-tight">{invite.role === 'admin' ? `Run ${invite.facilityName} on ${BRAND.name}` : `Join ${invite.facilityName} as an attendant`}</h1>
				<p class="text-base leading-6 text-muted">{invite.invitedBy ?? 'An admin'}, at {invite.facilityName}, invited you. {invite.accountExists ? 'Log in to accept.' : 'Set up your account to accept.'}</p>
			</div>
			{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

			{#if invite.accountExists}
				{#if matches}
					<p class="text-[15px]">You are logged in as <strong class="font-bold">{auth.user?.email}</strong>.</p>
					<button type="button" class="btn-primary" onclick={accept} disabled={busy}>{busy ? 'Accepting…' : `Accept and open ${invite.facilityName}`}</button>
				{:else}
					<p class="text-[15px] text-muted">An account already exists for <strong class="font-bold text-ink">{invite.email}</strong>. Log in with it, then come back to this link.</p>
					<a href="/login?redirect={encodeURIComponent(`/join-facility?token=${token}`)}" class="btn-primary">Log in to accept</a>
				{/if}
			{:else}
				<form onsubmit={join} class="flex flex-col gap-5">
					<div class="flex flex-col gap-2">
						<label for="email" class="field-label">Your email</label>
						<input id="email" type="email" value={invite.email} readonly class="field-input bg-rose-50 text-muted" />
						<span class="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-800"><Icon name="check" class="h-4 w-4" />Confirmed by your invite. It cannot be changed here.</span>
					</div>
					<TextField id="full-name" label="Your full name" autocomplete="name" placeholder="Mercy Chebet" bind:value={name} error={errors.name} />
					<div class="flex flex-col gap-2">
						<label for="signup-phone" class="field-label">Your phone number</label>
						<div class="flex gap-2"><span class="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-xl border-[1.5px] border-rose-200 bg-rose-50 text-base font-semibold">+254</span><input id="signup-phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="712 345 678" bind:value={phone} class="field-input min-w-0 flex-1 {errors.phone ? 'is-error' : ''}" /></div>
						{#if errors.phone}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.phone}</span>{:else}<span class="field-help">We text a code to confirm it is you.</span>{/if}
					</div>
					<PasswordInput id="signup-password" label="Password" autocomplete="new-password" placeholder="Create a password" bind:value={password} error={errors.password} help="At least 8 characters." />
					<button type="submit" class="btn-primary" disabled={busy || !name || !phone || !password}>{busy ? 'Creating…' : 'Create account and join'}</button>
				</form>
				<p class="text-center text-[15px] text-muted">Already have another account? <a href="/login?redirect={encodeURIComponent(`/join-facility?token=${token}`)}" class="link font-bold">Log in</a></p>
			{/if}
		</div>
	{:else}
		<p class="text-muted" role="status">Checking your invitation…</p>
	{/if}
</AuthShell>
