<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { shortDate } from '$lib/facility-status'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { MemberView, MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let people = $state<MemberView[]>([])
	let denied = $state(false)
	let adding = $state(false)
	let email = $state('')
	let role = $state<'attendant' | 'admin'>('attendant')
	let busy = $state(false)
	let error = $state('')
	let note = $state('')
	let confirm = $state<{ kind: 'promote' | 'demote' | 'remove' | 'revoke'; who: MemberView } | null>(null)

	async function load() {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			if (f.role !== 'admin') return void (denied = true)
			people = await auth.call<MemberView[]>(`/my-facilities/${id}/members`)
		} catch {
			denied = true
		}
	}
	onMount(load)

	const admins = $derived(people.filter((p) => p.role === 'admin' && p.status === 'active').length)

	async function invite(e: SubmitEvent, again?: MemberView) {
		e.preventDefault()
		error = ''
		note = ''
		busy = true
		const to = again?.email ?? email.trim()
		try {
			await auth.call(`/my-facilities/${id}/attendants`, { body: { email: to, role: again?.role ?? role } })
			note = `Invitation sent to ${to}. They join once they accept it.`
			adding = false
			email = ''
			await load()
		} catch (err) {
			error = err instanceof ApiError ? (err.fields.email ?? err.message) : 'Something went wrong.'
		} finally {
			busy = false
		}
	}

	async function doConfirm() {
		if (!confirm) return
		error = ''
		busy = true
		const { kind, who } = confirm
		try {
			if (kind === 'revoke') await auth.call(`/my-facilities/${id}/invites/${who.inviteId}`, { method: 'DELETE' })
			else if (kind === 'remove') await auth.call(`/my-facilities/${id}/members/${who.userId}`, { method: 'DELETE' })
			else await auth.call(`/my-facilities/${id}/members/${who.userId}`, { method: 'PATCH', body: { role: kind === 'promote' ? 'admin' : 'attendant' } })
			note = { promote: `${who.name} is now an admin.`, demote: `${who.name} is now an attendant.`, remove: `${who.name} was removed.`, revoke: `The invitation to ${who.email} was cancelled.` }[kind]
			confirm = null
			await load()
			if (kind === 'remove' && who.isMe) await auth.reload()
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong.'
			confirm = null
		} finally {
			busy = false
		}
	}
	/** Lets an attendant approve or reject blood requests (admins always can). */
	async function setApprove(who: MemberView, canApprove: boolean) {
		error = ''
		note = ''
		who.canApprove = canApprove // show it at once; undone below if the server refuses
		try {
			await auth.call(`/my-facilities/${id}/members/${who.userId}/permissions`, { body: { canApprove } })
			note = canApprove ? `${who.name} can now approve or reject requests.` : `${who.name} can no longer approve or reject requests.`
		} catch (err) {
			who.canApprove = !canApprove
			error = err instanceof ApiError ? err.message : 'Something went wrong.'
		}
	}
	const q = $derived(
		confirm
			? {
					promote: [`Make ${confirm.who.name} an admin?`, 'Admins can also add and remove attendants and edit the facility profile.', 'Make admin'],
					demote: [`Make ${confirm.who.name} an attendant?`, 'They keep working on requests and calls but lose the admin pages.', 'Make attendant'],
					remove: [`Remove ${confirm.who.name ?? confirm.who.email}?`, 'They lose access to this facility at once. Records they made stay.', 'Remove'],
					revoke: [`Cancel the invitation to ${confirm.who.email}?`, 'The link in their email stops working.', 'Cancel invitation'],
				}[confirm.kind]
			: null,
	)
	const rows = [
		['Confirm requests with the ward, ask for more information', true, true],
		['Approve or reject requests (attendants only when an admin allows it)', true, false],
		['Publish calls and drives, schedule donors', true, true],
		['Confirm donations and record blood type and weight', true, true],
		['Correct old records', true, false],
		['Add or remove attendants, promote an admin', true, false],
		['Edit the facility profile and invite link', true, false],
	] as const
</script>

<svelte:head><title>Attendants | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="attendants">
	{#if denied}
		<div class="card flex flex-col items-center gap-4 p-10 text-center"><span class="path-icon h-16 w-16"><Icon name="lock" class="h-8 w-8" /></span><h2 class="text-xl font-bold">Only facility admins can open this page</h2><p class="max-w-md text-[15px] text-muted">Ask an admin at {f?.name ?? 'your facility'} if you need someone added.</p></div>
	{:else if f}
		<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div class="flex flex-col gap-1.5">
				<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Attendants</h1>
				<p class="text-base leading-6 text-muted">People who can work on {f.name}'s requests, calls, and donations.</p>
			</div>
			{#if f.status === 'verified'}<button type="button" onclick={() => { adding = true; error = '' }} class="btn-primary sm:!w-auto sm:px-6">Add attendant</button>{/if}
		</header>

		{#if f.status !== 'verified'}<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>You can add attendants once the facility is verified.</p></div>{/if}
		{#if note}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{note}</p></div>{/if}
		{#if error && !adding}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		{#if adding}
			<form onsubmit={invite} class="card flex flex-col gap-4 p-6">
				<h2 class="text-2xl font-extrabold leading-8 tracking-tight">Add an attendant</h2>
				<p class="text-[15px] leading-[22px] text-muted">They get an invitation by email with the facility code. They create a facility account (no donor details) or accept with their existing one.</p>
				<div class="flex flex-col gap-2"><label for="s-email" class="field-label">Email</label><input id="s-email" type="email" bind:value={email} placeholder="name@facility.example" class="field-input {error ? 'is-error' : ''}" />{#if error}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{error}</span>{/if}</div>
				<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0"><legend class="field-label mb-2 p-0">Role</legend>
					<div class="grid grid-cols-2 gap-2"><label><input type="radio" name="role" value="attendant" bind:group={role} class="peer sr-only" /><span class="seg-box">Attendant</span></label><label><input type="radio" name="role" value="admin" bind:group={role} class="peer sr-only" /><span class="seg-box">Admin</span></label></div>
				</fieldset>
				<div class="grid gap-3 sm:grid-cols-2"><button type="button" class="btn-secondary" onclick={() => (adding = false)}>Cancel</button><button type="submit" class="btn-primary" disabled={busy || !email}>{busy ? 'Sending…' : 'Send invitation'}</button></div>
			</form>
		{/if}

		{#if confirm && q}
			<div class="card flex flex-col gap-4 border-red-300 p-6" role="alertdialog" aria-label={q[0]}>
				<h2 class="text-xl font-extrabold">{q[0]}</h2>
				<p class="text-[15px] text-muted">{q[1]}</p>
				<div class="grid gap-3 sm:grid-cols-2"><button type="button" class="btn-secondary" onclick={() => (confirm = null)}>Keep as it is</button><button type="button" class={confirm.kind === 'remove' || confirm.kind === 'revoke' ? 'btn-danger' : 'btn-primary'} onclick={doConfirm} disabled={busy}>{q[2]}</button></div>
			</div>
		{/if}

		<ul class="flex flex-col gap-3">
			{#each people as p (p.userId ?? p.inviteId)}
				<li class="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
					<div class="min-w-0">
						<p class="font-bold leading-6">{p.name ?? p.email}{#if p.isMe} <span class="font-normal text-muted">(you)</span>{/if}</p>
						<p class="truncate text-[13px] text-muted">{p.name ? `${p.email} · ` : ''}{p.status === 'invited' ? `Invite sent ${shortDate(p.since)}` : `Joined ${shortDate(p.since)}`}</p>
						<div class="mt-2 flex flex-wrap items-center gap-2"><span class="badge {p.role === 'admin' ? 'badge-soft' : 'badge-neutral'}">{p.role === 'admin' ? 'Admin' : 'Attendant'}</span><span class="badge {p.status === 'active' ? 'badge-ok' : 'badge-warn'}">{p.status === 'active' ? 'Active' : 'Invited'}</span></div>
						{#if p.status === 'active'}
							{#if p.role === 'admin'}
								<p class="mt-3 text-[13px] text-muted">Admins can always approve or reject requests.</p>
							{:else}
								<label class="mt-3 flex cursor-pointer items-center gap-3 text-[14px] font-semibold"><input type="checkbox" checked={p.canApprove} onchange={(e) => setApprove(p, e.currentTarget.checked)} class="peer sr-only" /><span class="switch"></span>Can approve or reject requests</label>
							{/if}
						{/if}
					</div>
					<div class="flex flex-wrap items-center gap-1 sm:justify-end">
						{#if p.status === 'invited'}
							<button type="button" class="link h-11 px-3 text-[15px]" onclick={(e) => invite(e as unknown as SubmitEvent, p)} disabled={busy}>Resend</button>
							<button type="button" class="link h-11 px-3 text-[15px]" onclick={() => (confirm = { kind: 'revoke', who: p })}>Cancel invitation</button>
						{:else}
							{#if p.role === 'attendant'}<button type="button" class="link h-11 px-3 text-[15px]" onclick={() => (confirm = { kind: 'promote', who: p })}>Make admin</button>{/if}
							{#if p.role === 'admin' && admins > 1 && !p.isMe}<button type="button" class="link h-11 px-3 text-[15px]" onclick={() => (confirm = { kind: 'demote', who: p })}>Make attendant</button>{/if}
							{#if p.role === 'admin' && admins <= 1}<span class="px-3 text-[13px] text-muted" title="The last admin cannot be removed">Last admin</span>{:else}<button type="button" class="link h-11 px-3 text-[15px] !text-red-700" onclick={() => (confirm = { kind: 'remove', who: p })}>Remove</button>{/if}
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		<section class="card p-6">
			<h2 class="text-lg font-bold">What each role can do</h2>
			<div class="mt-4 overflow-x-auto">
				<table class="w-full min-w-[460px] text-left text-[15px]">
					<thead class="text-[13px] font-bold uppercase tracking-wide text-muted"><tr><th class="py-2 pr-4">Action</th><th class="px-4 py-2 text-center">Admin</th><th class="px-4 py-2 text-center">Attendant</th></tr></thead>
					<tbody class="divide-y divide-rose-100">
						{#each rows as [a, adm, stf]}<tr><td class="py-3 pr-4">{a}</td><td class="px-4 py-3 text-center text-rose-600">{#if adm}<Icon name="check" class="mx-auto h-5 w-5" />{/if}</td><td class="px-4 py-3 text-center text-rose-600">{#if stf}<Icon name="check" class="mx-auto h-5 w-5" />{:else}<span class="text-muted">-</span>{/if}</td></tr>{/each}
					</tbody>
				</table>
			</div>
			<p class="mt-4 text-[13px] text-muted">A facility always keeps at least one admin.</p>
		</section>
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
