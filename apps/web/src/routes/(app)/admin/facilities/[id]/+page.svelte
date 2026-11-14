<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate, nairobiDateTime } from '$lib/dates'
	import { STATUS } from '$lib/facility-status'
	import AdminShell from '$lib/ui/AdminShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { AdminFacilityDetail } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let d = $state<AdminFacilityDetail | null>(null)
	let missing = $state(false)
	let how = $state('Called the facility')
	let note = $state('')
	let panel = $state<'' | 'ask' | 'reject' | 'suspend'>('')
	let text = $state('')
	let busy = $state(false)
	let error = $state('')
	let done = $state('')

	async function load() {
		if (!auth.user?.isSuperAdmin) return
		try {
			d = await auth.call<AdminFacilityDetail>(`/admin/facilities/${id}`)
		} catch {
			missing = true
		}
	}
	onMount(load)

	const HOW = ['Called the facility', 'Checked the license register', 'Checked with the county health office', 'Visited the facility', 'Other']
	const said: Record<string, string> = {
		approve: 'Approved. The facility is verified and the applicant is now its admin. They were told by email.',
		reject: 'Rejected. The applicant can read your reason and submit again.',
		ask: 'Question sent. The facility shows "More information needed" until they reply.',
		suspend: 'Suspended. The facility cannot publish calls or alert donors.',
		reactivate: 'Reactivated. The facility can publish calls again.',
		note: 'Note saved.',
	}

	async function decide(action: string, body: { text?: string } = {}) {
		error = ''
		done = ''
		busy = true
		try {
			await auth.call(`/admin/facilities/${id}/decision`, { body: { action, how: action === 'approve' || action === 'note' ? how : undefined, text: body.text ?? (action === 'approve' ? note || undefined : undefined) } })
			done = said[action]
			panel = ''
			text = ''
			if (action === 'note' || action === 'approve') note = ''
			await load()
		} catch (e) {
			error = e instanceof ApiError ? (e.fields.text ?? e.message) : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	const label = (k: string) => ({ submitted: 'Submitted', resubmitted: 'Submitted again', ask: 'Question sent', reply: 'Applicant replied', approve: 'Approved', reject: 'Rejected', suspend: 'Suspended', reactivate: 'Reactivated', note: 'Note' })[k] ?? k
	const title = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
	const open = $derived(d?.status === 'pending' || d?.status === 'needs_info')
</script>

<svelte:head><title>Review facility | {BRAND.name}</title></svelte:head>

<AdminShell active="queue">
	<a href="/admin/queue" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Queue</a>

	{#if missing}
		<div class="notice-error" role="alert"><p>We could not find this facility.</p></div>
	{:else if d}
		{#if done}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">{done.split('.')[0]}.</strong>{done.slice(done.indexOf('.') + 1)} <a href="/admin/queue" class="link">Back to the queue</a></p></div>{/if}
		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		<header class="flex flex-col gap-1.5">
			{#if d.submittedAt}<p class="text-sm font-bold uppercase tracking-[.14em] text-muted">Submitted {longDate(d.submittedAt.slice(0, 10))}</p>{/if}
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{d.name}</h1>
			<p class="flex flex-wrap items-center gap-2 text-base text-muted"><span class="badge {STATUS[d.status][0]}">{STATUS[d.status][1]}</span>{d.town}, {d.county} · {title(d.type)}</p>
		</header>

		<div class="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
			<div class="flex flex-col gap-6">
				<section class="card p-6">
					<h2 class="mb-4 text-lg font-bold">Details</h2>
					<dl class="grid gap-px overflow-hidden rounded-xl border border-rose-200 bg-rose-200 sm:grid-cols-2">
						{#each [['Name', d.name], ['Type', title(d.type)], ['County and town', `${d.county} County, ${d.town}`], ['Facility phone', d.phone ?? ''], ['License number', d.licenseNumber ?? ''], ['GPS pin', d.lat != null ? `${d.lat}, ${d.lng}` : 'Not given'], ['Facility email', d.email ?? ''], ['Facility code', d.facilityCode ?? ''], ['Owner or operator', d.owner ?? 'Not given'], ['Street or landmark', d.address ?? 'Not given']] as [l, v]}
							<div class="bg-white p-4"><dt class="text-[13px] text-muted">{l}</dt><dd class="text-[17px] font-bold break-words">{v}</dd></div>
						{/each}
					</dl>
					{#if d.duplicates.length}
						<div class="mt-4 rounded-xl bg-amber-50 p-3 text-[15px] text-amber-900"><strong class="font-bold">Same license number as {d.duplicates.length === 1 ? 'another facility' : `${d.duplicates.length} other facilities`}:</strong> {#each d.duplicates as x, i}<a href="/admin/facilities/{x.id}" class="link">{x.name}, {x.town}</a> ({STATUS[x.status][1]}){i < d.duplicates.length - 1 ? ', ' : ''}{/each}. Look at both before approving.</div>
					{:else}
						<div class="mt-4 flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-[15px] text-emerald-900">No other facility uses this license number.</div>
					{/if}
					{#if d.lat != null}<p class="mt-3 text-[15px]"><a class="link" href="https://www.openstreetmap.org/?mlat={d.lat}&mlon={d.lng}#map=16/{d.lat}/{d.lng}" target="_blank" rel="noopener noreferrer">Open the pin on a map</a> <span class="text-muted">and check it sits on the facility.</span></p>{/if}
				</section>

				<section class="card p-6">
					<h2 class="mb-4 text-lg font-bold">Applicant</h2>
					{#if d.applicant}
						<dl class="grid gap-px overflow-hidden rounded-xl border border-rose-200 bg-rose-200 sm:grid-cols-2">
							{#each [['Name', d.applicant.name], ['Role', d.applicant.roleTitle ?? ''], ['Email', `${d.applicant.email}${d.applicant.emailVerified ? ' (verified)' : ' (not verified)'}`], ['Phone', `${d.applicant.phone}${d.applicant.phoneVerified ? ' (verified)' : ' (not verified)'}`]] as [l, v]}
								<div class="bg-white p-4"><dt class="text-[13px] text-muted">{l}</dt><dd class="text-[17px] font-bold break-words">{v}</dd></div>
							{/each}
						</dl>
					{:else}<p class="text-[15px] text-muted">No applicant on record.</p>{/if}
				</section>

				<section class="card flex flex-col gap-3 p-6">
					<h2 class="mb-1 text-lg font-bold">History and notes</h2>
					<ul class="flex flex-col gap-3">
						{#each d.events as e}
							<li class="rounded-xl p-4 text-[15px] leading-[22px] {e.visible ? 'bg-rose-50' : 'bg-slate-50'}">
								<span class="block text-[13px] font-semibold text-muted">{nairobiDateTime(e.at)} · {e.byName ?? 'System'} · {label(e.kind)}{e.how ? ` · ${e.how}` : ''}{e.visible ? ' · seen by the applicant' : ''}</span>{e.text ?? ''}
							</li>
						{/each}
					</ul>
				</section>
			</div>

			<aside class="card flex flex-col gap-4 p-6 xl:sticky xl:top-8">
				<h2 class="text-lg font-bold">Your decision</h2>
				{#if open}
					<div class="flex flex-col gap-2"><label for="how" class="field-label">How did you check it?</label><select id="how" bind:value={how} class="field-input">{#each HOW as h}<option>{h}</option>{/each}</select></div>
					<div class="flex flex-col gap-2"><label for="note" class="field-label">Note</label><textarea id="note" rows="3" bind:value={note} class="w-full rounded-xl border-[1.5px] border-field bg-white p-4 text-base text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"></textarea></div>
					<button type="button" class="btn-primary" onclick={() => decide('approve')} disabled={busy}>Approve</button>
					<button type="button" class="btn-secondary" onclick={() => decide('note', { text: note })} disabled={busy || !note.trim()}>Save as a note only</button>
					<button type="button" class="btn-secondary" onclick={() => { panel = panel === 'ask' ? '' : 'ask'; text = '' }}>Ask for more information</button>
					<button type="button" class="btn-danger" onclick={() => { panel = panel === 'reject' ? '' : 'reject'; text = '' }}>Reject</button>
				{:else if d.status === 'verified'}
					<p class="text-[15px] text-muted">This facility is verified.</p>
					<button type="button" class="btn-danger" onclick={() => { panel = panel === 'suspend' ? '' : 'suspend'; text = '' }}>Suspend</button>
				{:else if d.status === 'suspended'}
					<p class="text-[15px] text-muted">This facility is suspended.</p>
					<button type="button" class="btn-primary" onclick={() => decide('reactivate')} disabled={busy}>Reactivate</button>
				{:else}
					<p class="text-[15px] text-muted">{d.status === 'rejected' ? 'Rejected. Waiting for the applicant to correct and submit again.' : 'Nothing to decide yet.'}</p>
				{/if}

				{#if panel}
					<form onsubmit={(e) => { e.preventDefault(); void decide(panel, { text }) }} class="flex flex-col gap-3 rounded-xl border {panel === 'ask' ? 'border-rose-200 bg-rose-50' : 'border-red-300 bg-red-50'} p-4">
						<label for="decision-text" class="field-label">{panel === 'ask' ? 'Your question' : panel === 'reject' ? 'Reason (shown to the applicant)' : 'Why is it suspended?'}</label>
						<textarea id="decision-text" rows="3" bind:value={text} class="w-full rounded-xl border-[1.5px] border-field bg-white p-4 text-base text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"></textarea>
						<div class="grid gap-2 sm:grid-cols-2"><button type="button" class="btn-secondary" onclick={() => (panel = '')}>Cancel</button><button type="submit" class="{panel === 'ask' ? 'btn-primary' : 'btn-danger'}" disabled={busy || !text.trim()}>{panel === 'ask' ? 'Send question' : panel === 'reject' ? 'Reject' : 'Suspend'}</button></div>
					</form>
				{/if}
			</aside>
		</div>
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</AdminShell>
