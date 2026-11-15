<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError, apiFetch } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { dayOf, longDay, monthOf } from '$lib/drives'
	import { driveHours, type PublicDrive } from '@damu/shared-types'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'
	import TextField from '$lib/ui/TextField.svelte'

	const code = $derived(page.params.code)
	let d = $state<PublicDrive | null>(null)
	let name = $state('')
	let phone = $state('')
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	onMount(async () => {
		d = await apiFetch<PublicDrive>(`/public/drives/${encodeURIComponent(code)}`).catch(() => null)
		await auth.init?.()
	})
	async function submit(e?: Event) {
		e?.preventDefault()
		busy = true
		error = ''
		errors = {}
		try {
			if (auth.user) await auth.call(`/public/drives/${encodeURIComponent(code)}/interest`, { body: {} })
			else await apiFetch(`/public/drives/${encodeURIComponent(code)}/interest`, { body: { name, phone: phone || null } })
			await goto(`/drives/${encodeURIComponent(code)}?done=1`)
		} catch (err) {
			if (err instanceof ApiError) {
				errors = err.fields
				error = Object.keys(err.fields).length ? '' : err.message
			} else error = 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>I am interested | {BRAND.name}</title><meta name="robots" content="noindex" /></svelte:head>

<PublicNav />
<main class="mx-auto flex max-w-xl flex-col gap-6 px-6 py-10">
	<a href="/drives/{code}" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Back to the drive</a>
	<form class="card flex flex-col gap-6 p-6 md:p-8" onsubmit={submit}>
		{#if d}<div class="flex items-center gap-4 rounded-xl bg-rose-50 p-4"><span class="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-rose-600 text-white"><span class="text-[11px] font-bold leading-3">{monthOf(d.date)}</span><span class="text-[22px] font-extrabold leading-6">{dayOf(d.date)}</span></span><span class="leading-5"><span class="block font-bold">{d.host} blood drive</span><span class="block text-[13px] text-muted">{longDay(d.date).split(' ')[0]}, {driveHours(d.starts, d.ends)} · {d.venue}, {d.town}</span></span></div>{/if}
		<header class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight">I am interested in donating</h1><p class="text-base leading-6 text-muted">{auth.user ? `You are signed in as ${auth.user.name}. One tap and you are on the list.` : 'Just a name, so the facility can plan. No account needed.'}</p></header>
		{#if !auth.user}
			<TextField id="name" label="Your name" bind:value={name} error={errors.name ?? ''} placeholder="Amina Wanjiru" />
			<TextField id="phone" label="Phone number (optional)" bind:value={phone} type="tel" inputmode="tel" error={errors.phone ?? ''} placeholder="0712 345 678" help="Only used by the facility if the drive changes. Deleted after the drive." />
		{/if}
		{#if error}<p class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />{error}</p>{/if}
		<button class="btn-primary" disabled={busy || (!auth.user && !name.trim())}>{busy ? 'Saving…' : 'I am interested'}</button>
		{#if !auth.user}<p class="text-center text-[15px] text-muted">Have an account? <a class="link" href="/login">Use it instead</a></p>{/if}
	</form>
</main>
<PublicFooter />
