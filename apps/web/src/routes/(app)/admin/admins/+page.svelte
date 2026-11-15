<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import AdminShell from '$lib/ui/AdminShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { AdminUserRow } from '@damu/shared-types'

	let rows = $state<AdminUserRow[]>([])
	let loaded = $state(false)
	let adding = $state(false)
	let email = $state('')
	let removing = $state<AdminUserRow | null>(null)
	let error = $state('')
	let busy = $state(false)
	const load = async () => (rows = await auth.call<AdminUserRow[]>('/admin/admins'))
	onMount(async () => {
		await load().catch(() => (error = 'Could not load the list.'))
		loaded = true
	})
	async function run(fn: () => Promise<unknown>) {
		busy = true
		error = ''
		try {
			await fn()
			adding = false
			removing = null
			email = ''
			await load()
		} catch (e) {
			error = e instanceof ApiError ? (e.fields.email ?? e.message) : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	const initials = (n: string) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
</script>

<svelte:head><title>Super admins | {BRAND.name}</title></svelte:head>

<AdminShell active="admins">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Super admins</h1><p class="text-base leading-6 text-muted">Full access to every facility, setting and log. Keep this list short.</p></div>
		<button type="button" class="btn-primary flex !w-auto items-center gap-2 px-6" onclick={() => { adding = true; error = '' }}><Icon name="plus" />Add a super admin</button>
	</header>
	{#if error && !adding && !removing}<p class="notice-error" role="alert">{error}</p>{/if}
	{#if !loaded}<p class="text-muted" role="status">Loading…</p>{:else}
		<ul class="card divide-y divide-rose-100">
			{#each rows as r (r.id)}
				<li class="flex items-center gap-4 p-5">
					<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700" aria-hidden="true">{initials(r.name)}</span>
					<span class="min-w-0 flex-1 leading-6"><span class="flex items-center gap-2 font-bold">{r.name}{#if r.you}<span class="badge badge-soft">You</span>{/if}</span><span class="block truncate text-[14px] text-muted">{r.email} · added {r.addedAt ? longDate(r.addedAt.slice(0, 10)) : 'Launch team'}</span></span>
					<button type="button" class="link flex h-11 w-11 items-center justify-center disabled:opacity-40" aria-label="Remove {r.name}" title={r.you ? 'You cannot remove yourself' : 'Remove'} disabled={r.you} onclick={() => { removing = r; error = '' }}><Icon name="trash" /></button>
				</li>
			{/each}
		</ul>
		<p class="text-[13px] text-muted">A super admin must already have a {BRAND.name} account with a verified email. Adding and removing is written to the audit log.</p>
	{/if}
</AdminShell>

{#if adding || removing}
	<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
		{#if adding}
			<form class="card flex w-full max-w-md flex-col gap-4 p-6" onsubmit={(e) => { e.preventDefault(); void run(() => auth.call('/admin/admins', { body: { email } })) }}>
				<h2 id="dlg-h" class="text-xl font-extrabold">Add a super admin</h2>
				<div class="flex flex-col gap-2"><label for="em" class="field-label">Their account email</label><input id="em" type="email" bind:value={email} class="field-input {error ? 'is-error' : ''}" autocomplete="off" />{#if error}<span class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</span>{/if}</div>
				<div class="flex gap-3"><button class="btn-primary sm:!w-auto sm:px-6" disabled={busy || !email.trim()}>{busy ? 'Adding…' : 'Add super admin'}</button><button type="button" class="btn-secondary sm:!w-auto sm:px-6" onclick={() => (adding = false)}>Cancel</button></div>
			</form>
		{:else if removing}
			<div class="card flex w-full max-w-md flex-col gap-4 p-6"><h2 id="dlg-h" class="text-xl font-extrabold">Remove {removing.name}?</h2><p class="text-muted">They stay a normal account but lose super admin access at once.</p>{#if error}<p class="field-error" role="alert">{error}</p>{/if}
				<div class="flex gap-3"><button type="button" class="btn-danger sm:!w-auto sm:px-6" disabled={busy} onclick={() => { const id = removing!.id; void run(() => auth.call(`/admin/admins/${id}`, { method: 'DELETE' })) }}>{busy ? 'Removing…' : 'Remove'}</button><button type="button" class="btn-secondary sm:!w-auto sm:px-6" onclick={() => (removing = null)}>Keep</button></div></div>
		{/if}
	</div>
{/if}
