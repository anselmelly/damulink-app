<script lang="ts">
	import { goto } from '$app/navigation'
	import { onDestroy, onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import OtpInput from '$lib/ui/OtpInput.svelte'

	let code = $state('')
	let problem = $state<{ icon: string; title: string; text: string } | null>(null)
	let busy = $state(false)
	let seconds = $state(60) // the signup just sent a code
	let info = $state('')
	let changing = $state(false)
	let newPhone = $state('')
	let timer: ReturnType<typeof setInterval>

	onMount(() => {
		if (auth.user?.phoneVerified) void goto('/choose-path', { replaceState: true })
		timer = setInterval(() => (seconds = Math.max(0, seconds - 1)), 1000)
	})
	onDestroy(() => clearInterval(timer))

	async function verify(e: SubmitEvent) {
		e.preventDefault()
		problem = null
		busy = true
		try {
			await auth.call('/auth/phone/verify', { body: { code } })
			await auth.reload()
			await goto('/choose-path')
		} catch (err) {
			const c = err instanceof ApiError ? err.code : ''
			if (c === 'code_expired') problem = { icon: 'clock', title: 'That code has expired.', text: ' Codes work for 10 minutes. Ask for a new one below.' }
			else if (c === 'locked') problem = { icon: 'lock', title: 'Too many tries.', text: ' For your safety, try again in 15 minutes, or change your number.' }
			else if (c === 'wrong_code') problem = { icon: 'alert', title: 'That code is not right.', text: ' Check the message and try again.' }
			else problem = { icon: 'alert', title: err instanceof ApiError ? err.message : 'Something went wrong.', text: '' }
		} finally {
			busy = false
		}
	}

	async function resend(phone?: string) {
		info = ''
		problem = null
		try {
			await auth.call('/auth/phone/send', { body: phone ? { phone } : {} })
			code = ''
			seconds = 60
			info = 'We sent a new code.'
			if (phone) {
				await auth.reload()
				changing = false
				newPhone = ''
			}
		} catch (err) {
			problem = { icon: 'alert', title: err instanceof ApiError ? err.message : 'Something went wrong.', text: '' }
		}
	}
</script>

<svelte:head><title>Verify phone | {BRAND.name}</title></svelte:head>

<AuthShell
	brandText="We verify your number so medical facilities can reach you, and alerts only go to people who can answer them."
	brandPoints={['Your number is never shown publicly', 'Shared with a medical facility only after you reply YES', 'Reply STOP to any alert to pause them']}
>
	<div class="flex flex-col">
		<div class="mt-2 flex flex-col gap-3.5">
			<div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Icon name="phone" class="h-[30px] w-[30px]" /></div>
			<h1 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight">Verify your phone</h1>
			<p class="text-base leading-6 text-muted">We sent a 6-digit code by SMS to <strong class="font-bold text-ink">{auth.user?.phone}</strong>. Enter it below.</p>
		</div>

		{#if problem}
			<div class="notice-error mt-6" role="alert"><Icon name={problem.icon} class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">{problem.title}</strong>{problem.text}</p></div>
		{/if}

		<form onsubmit={verify} class="mt-8 flex flex-col">
			<fieldset class="min-w-0 border-0 p-0">
				<legend class="mb-2.5 p-0 text-sm font-semibold leading-5">Verification code</legend>
				<OtpInput bind:value={code} error={!!problem} />
			</fieldset>
			<button type="submit" class="btn-primary mt-6" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify phone'}</button>
		</form>

		<div class="mt-5 flex flex-col gap-1.5 text-center text-[15px] leading-[22px] text-muted">
			{#if seconds > 0}
				<span>Did not get a code? Resend in <span class="font-semibold text-ink">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></span>
			{:else}
				<button type="button" class="link h-11 font-bold" onclick={() => resend()}>Resend code</button>
			{/if}
			{#if info}<span role="status">{info}</span>{/if}
			<button type="button" class="link font-bold" onclick={() => (changing = !changing)}>Change phone number</button>
		</div>

		{#if changing}
			<form onsubmit={(e) => { e.preventDefault(); void resend('254' + newPhone.replace(/\D/g, '').replace(/^0/, '')) }} class="mt-4 flex flex-col gap-3">
				<label for="new-phone" class="field-label">New phone number</label>
				<div class="flex gap-2">
					<span class="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-xl border-[1.5px] border-rose-200 bg-rose-50 text-base font-semibold">+254</span>
					<input id="new-phone" type="tel" inputmode="numeric" placeholder="712 345 678" bind:value={newPhone} class="field-input min-w-0 flex-1" />
				</div>
				<button type="submit" class="btn-secondary" disabled={!newPhone}>Send a code to this number</button>
			</form>
		{/if}

		<p class="notice mt-8">The code expires after 10 minutes. Standard SMS rates may apply.</p>
	</div>
</AuthShell>
