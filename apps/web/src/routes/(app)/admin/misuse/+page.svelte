<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import AdminShell from '$lib/ui/AdminShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { FlagItem, FlagList } from '@damu/shared-types'

	let list = $state<FlagList | null>(null)
	let loaded = $state(false)
	let review = $state<FlagItem | null>(null)
	let suspend = $state<FlagItem | null>(null)
	let reason = $state('')
	let error = $state('')
	let done = $state('')
	let busy = $state(false)
	const load = async () => (list = await auth.call<FlagList>('/admin/flags'))
	onMount(async () => {
		await load().catch(() => (error = 'Could not load the list.'))
		loaded = true
	})
	const day = (iso: string) => longDate(iso.slice(0, 10))
	const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
	async function run(fn: () => Promise<unknown>, msg: string) {
		busy = true
		error = ''
		try {
			await fn()
			suspend = null
			reason = ''
			done = msg
			await load()
		} catch (e) {
			error = e instanceof ApiError ? (e.fields.reason ?? e.message) : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Misuse | {BRAND.name}</title></svelte:head>

<AdminShell active="misuse">
	<header class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Misuse</h1><p class="max-w-2xl text-base leading-6 text-muted">People flagged for repeated rejected requests or no-shows. A flag is a prompt to look, not a penalty.</p></header>
	{#if done}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{done}</p></div>{/if}
	{#if error && !suspend}<p class="notice-error" role="alert">{error}</p>{/if}
	{#if !loaded}<p class="text-muted" role="status">Loading…</p>
	{:else if list && !list.items.length}<div class="card p-8 text-center text-muted">Nobody is flagged. Flags appear here when someone has 3 requests rejected in 7 days, or misses visits at 2 facilities in 30 days.</div>
	{:else if list}
		<ul class="flex flex-col gap-3">
			{#each list.items as f (f.id)}
				<li class="card flex items-start justify-between gap-3 p-4 md:items-center md:px-6">
					<div class="flex min-w-0 flex-col gap-1 md:flex-1 md:flex-row md:items-center md:gap-6">
						<p class="font-bold md:w-56">{f.person.name} <span class="block text-[13px] font-normal text-muted md:mt-0.5">{f.person.role}</span></p>
						<p class="text-[15px] leading-[22px] md:flex-1">{f.reason}</p>
						<p class="text-[13px] text-muted md:w-24 md:text-[15px]">Flagged {day(f.flaggedAt)}</p>
					</div>
					<span class="flex items-center justify-end gap-1">
						<button type="button" title="Review" aria-label="Review {f.person.name}" onclick={() => (review = f)} class="flex h-11 w-11 items-center justify-center rounded-lg text-red-700 hover:bg-rose-100"><Icon name="search" /></button>
						<button type="button" title="Suspend" aria-label="Suspend {f.person.name}" onclick={() => { suspend = f; reason = ''; error = ''; done = '' }} class="flex h-11 w-11 items-center justify-center rounded-lg text-red-700 hover:bg-rose-100"><Icon name="lock" /></button>
						<button type="button" title="Clear flag" aria-label="Clear flag for {f.person.name}" disabled={busy} onclick={() => run(() => auth.call(`/admin/flags/${f.id}/dismiss`, { body: {} }), 'Flag cleared.')} class="flex h-11 w-11 items-center justify-center rounded-lg text-red-700 hover:bg-rose-100"><Icon name="check" /></button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</AdminShell>

{#if review || suspend}
	<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
		{#if review}
			<div class="card flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-6">
				<h2 id="dlg-h" class="text-2xl font-extrabold leading-8 tracking-tight">{review.person.name}</h2>
				<p class="text-[13px] text-muted">{review.person.role} · {review.person.phone} · joined {day(review.person.joinedAt)}</p>
				<ul class="flex flex-col divide-y divide-rose-100 text-[15px]">{#each review.evidence as e}<li class="flex gap-3 py-3"><span class="w-24 shrink-0 text-[13px] text-muted">{stamp(e.at)}</span><span class="leading-5">{e.ref} {e.note}</span></li>{/each}</ul>
				<button type="button" class="btn-secondary" onclick={() => (review = null)}>Close</button>
			</div>
		{:else if suspend}
			<form class="card flex w-full max-w-md flex-col gap-4 p-6" onsubmit={(e) => { e.preventDefault(); const id = suspend!.person.id; void run(() => auth.call(`/admin/users/${id}/suspend`, { body: { reason } }), 'Account suspended. They cannot raise requests or sign in. It is in the audit log.') }}>
				<span class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700"><Icon name="lock" /></span>
				<h2 id="dlg-h" class="text-2xl font-extrabold leading-8 tracking-tight">Suspend {suspend.person.name}?</h2>
				<p class="text-[15px] leading-[22px] text-muted">They cannot sign in or raise requests. Open requests are closed. You can reactivate them later.</p>
				<div class="flex flex-col gap-2"><label for="sr" class="field-label">Reason</label><input id="sr" bind:value={reason} class="field-input {error ? 'is-error' : ''}" autocomplete="off" />{#if error}<span class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</span>{/if}</div>
				<div class="mt-2 grid gap-3 sm:grid-cols-2"><button type="button" class="btn-secondary" onclick={() => (suspend = null)}>Cancel</button><button class="btn-danger" disabled={busy || reason.trim().length < 5}>{busy ? 'Suspending…' : 'Suspend'}</button></div>
			</form>
		{/if}
	</div>
{/if}
