<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { REJECT_REASON_TEXT, REQUEST_STATUS, neededAt, plural, relationLabel, sentAt } from '$lib/requests'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import { CALL_STATUS, closesOn, shortLink } from '$lib/calls'
	import type { RequestDetail } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let d = $state<RequestDetail | null>(null)
	let missing = $state(false)
	let reply = $state('')
	let busy = $state(false)
	let error = $state('')
	let cancelling = $state(false)
	let reason = $state('')

	onMount(async () => {
		try {
			d = await auth.call<RequestDetail>(`/requests/${id}`)
		} catch {
			missing = true
		}
	})

	// Sent, Confirmed offline, Approved, Published: how far along the request is.
	const STEPS = ['Sent', 'Confirmed offline', 'Approved', 'Published']
	const reached = $derived(d ? ({ pending: 1, needs_info: 1, confirmed: 2, approved: 3, published: 4, closed: 4, rejected: 1, cancelled: 1 } as Record<string, number>)[d.status] : 0)
	const headline = $derived(
		d
			? ({
					pending: ['Waiting for the facility', `${d.facility.name} has your request. Attendants will check with the ward, and may call you.`],
					needs_info: ['The facility has a question', 'Please answer below so attendants can continue.'],
					confirmed: ['The facility confirmed it', 'Attendants checked with the ward. They are now deciding whether to approve the request.'],
					approved: ['Approved by the facility', 'The facility may now share a call. If it does, you will see it here and can share it.'],
					published: ['A call is live', `${d.facility.name} shared a public call. Share it to reach more people.`],
					closed: ['Closed', 'The facility closed this request.'],
					rejected: ['The facility could not approve this request', 'You can read why below, and send a new request if details were wrong.'],
					cancelled: ['You cancelled this request', 'The facility has been told.'],
				} as Record<string, [string, string]>)[d.status]
			: ['', ''],
	)
	const open = $derived(d ? ['pending', 'needs_info', 'confirmed', 'approved', 'published'].includes(d.status) : false)

	async function send(e: SubmitEvent) {
		e.preventDefault()
		if (!d) return
		error = ''
		busy = true
		try {
			d = await auth.call<RequestDetail>(`/requests/${d.id}/reply`, { body: { message: reply } })
			reply = ''
		} catch (err) {
			error = err instanceof ApiError ? (err.fields.message ?? err.message) : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	async function cancel() {
		if (!d) return
		error = ''
		busy = true
		try {
			d = await auth.call<RequestDetail>(`/requests/${d.id}/cancel`, { body: { reason: reason || undefined } })
			cancelling = false
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong.'
			cancelling = false
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>{d ? d.number : 'Request'} | {BRAND.name}</title></svelte:head>

<AccountShell active="requests">
	<a href="/requests" class="link inline-flex items-center gap-1 self-start text-[15px]"><Icon name="chev-l" class="h-5 w-5" />My requests</a>

	{#if missing}
		<div class="card p-8 text-center"><h1 class="text-xl font-bold">Request not found</h1><p class="mt-2 text-muted">It may belong to another account.</p></div>
	{:else if !d}
		<p class="text-muted" role="status">Loading…</p>
	{:else}
		<header class="flex items-start gap-4">
			<BloodChip type={d.blood?.bloodType ?? d.bloodTypeAsked} />
			<div class="flex min-w-0 flex-col gap-1">
				<p class="text-[13px] font-semibold text-muted">{d.number}</p>
				<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">{(d.blood?.bloodType ?? d.bloodTypeAsked) === 'unsure' ? 'Blood' : `${d.blood?.bloodType ?? d.bloodTypeAsked} blood`}, {plural(d.blood?.units ?? d.unitsAsked, 'unit')}</h1>
				<p class="text-[15px] text-muted">{d.facility.name}, {d.facility.town} · Sent {sentAt(d.createdAt)}</p>
			</div>
		</header>

		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		<section class="card flex flex-col gap-5 p-6 md:p-8" aria-label="Status">
			<div class="flex flex-wrap items-center gap-3"><span class="badge {REQUEST_STATUS[d.status][0]}">{REQUEST_STATUS[d.status][1]}</span><h2 class="text-xl font-bold">{headline[0]}</h2></div>
			<p class="text-[15px] leading-[22px] text-muted">{headline[1]}</p>
			<ol class="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Progress">
				{#each STEPS as s, i}
					<li class="flex items-center gap-2 text-[14px] {i < reached ? 'font-bold text-ink' : 'text-muted'}">
						<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold {i < reached ? 'bg-rose-600 text-white' : 'bg-rose-100 text-red-700'}">{#if i < reached}<Icon name="check" class="h-4 w-4" />{:else}{i + 1}{/if}</span>
						<span>{s}{#if i === 3 && d.status !== 'published' && d.status !== 'closed'}<span class="block text-[12px] font-normal">If the facility shares it</span>{/if}</span>
					</li>
				{/each}
			</ol>
		</section>

		{#if d.call}
			<section class="card flex flex-col gap-3 p-6 md:p-8" aria-label="Public call">
				<div class="flex flex-wrap items-center gap-3"><h2 class="text-lg font-bold">Public call {d.call.number}</h2><span class="badge {CALL_STATUS[d.call.status][0]}">{CALL_STATUS[d.call.status][1]}</span></div>
				<p class="text-[15px]">{d.call.covered} of {d.call.units} {d.call.units === 1 ? 'unit' : 'units'} donated.{#if d.call.status === 'live'} Open until {closesOn(d.call.closesAt)}.{/if}</p>
				{#if d.call.status === 'live'}
					<p class="text-[14px] text-muted">Share this link: <code class="rounded bg-rose-50 px-2 py-1">{shortLink(location.origin, d.call.short)}</code></p>
					<div class="flex flex-wrap gap-4 text-[15px]"><a href="/calls/{d.call.number}" target="_blank" class="link">Open the public page</a><a href="/calls/{d.call.number}/share" target="_blank" class="link">Poster and WhatsApp</a></div>
				{/if}
				<p class="flex items-center gap-2 text-[14px] text-muted"><Icon name="lock" class="h-4 w-4" />Donors' details stay with the facility.</p>
			</section>
		{/if}

		{#if d.status === 'needs_info' && d.question}
			<section class="card flex flex-col gap-4 p-6 md:p-8">
				<h2 class="text-lg font-bold">Message from {d.facility.name}</h2>
				<p class="text-[15px] leading-[22px]">{d.question}</p>
				<form onsubmit={send} class="flex flex-col gap-3">
					<label for="reply" class="field-label">Your reply</label>
					<textarea id="reply" rows="3" maxlength="500" bind:value={reply} class="field-input"></textarea>
					<button class="btn-primary self-start sm:!w-auto sm:px-8" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
				</form>
			</section>
		{/if}

		{#if d.status === 'rejected'}
			<section class="card flex flex-col gap-3 p-6 md:p-8">
				<h2 class="flex items-center gap-2 text-lg font-bold"><Icon name="info" class="h-5 w-5 text-red-700" />Reason from the facility</h2>
				<p class="text-[15px] leading-[22px]">{REJECT_REASON_TEXT[d.rejectReason ?? 'other']}</p>
				{#if d.rejectMessage}<p class="text-[15px] leading-[22px] text-muted">{d.rejectMessage}</p>{/if}
				<a href="/request" class="btn-secondary self-start sm:!w-auto sm:px-8">Send a new request</a>
			</section>
		{/if}

		<section class="card flex flex-col gap-4 p-6 md:p-8" aria-label="Request details">
			<h2 class="text-lg font-bold">Request details</h2>
			<p class="flex items-center gap-2 text-[14px] text-muted"><Icon name="lock" class="h-4 w-4" />Only you and the facility can see this page.</p>
			<dl class="grid gap-x-8 gap-y-3 text-[15px] sm:grid-cols-[180px_1fr]">
				<dt class="text-muted">Hospital</dt><dd>{d.facility.name}, {d.facility.town}</dd>
				<dt class="text-muted">Patient</dt><dd>{d.patientRef}{d.patientName ? ' (name on file)' : ''}</dd>
				<dt class="text-muted">Blood type</dt><dd>{d.bloodTypeAsked === 'unsure' ? 'Not sure' : d.bloodTypeAsked}{#if d.blood && d.blood.bloodType !== d.bloodTypeAsked}<span class="text-muted"> (the facility confirmed {d.blood.bloodType})</span>{/if}</dd>
				<dt class="text-muted">Units</dt><dd>{d.unitsAsked}</dd>
				<dt class="text-muted">Needed by</dt><dd>{neededAt(d.neededBy)}</dd>
				<dt class="text-muted">Urgency</dt><dd class="capitalize">{d.urgencyAsked}</dd>
				<dt class="text-muted">Your relationship</dt><dd>{relationLabel(d.relation)}</dd>
				{#if d.note}<dt class="text-muted">Note</dt><dd>{d.note}</dd>{/if}
			</dl>
		</section>

		<section class="card flex flex-col gap-4 p-6 md:p-8" aria-label="History">
			<h2 class="text-lg font-bold">History</h2>
			<ol class="flex flex-col gap-3 text-[15px]">
				{#each d.timeline as e}
					<li class="flex flex-wrap gap-x-3"><span class="w-40 shrink-0 text-muted">{sentAt(e.at)}</span><span><span class="font-semibold capitalize">{e.kind}</span>{#if e.text}<span class="text-muted"> · {e.text}</span>{/if}</span></li>
				{/each}
			</ol>
		</section>

		{#if open}
			<section class="flex flex-col items-start gap-2">
				<h2 class="text-sm font-bold text-muted">Change of plans?</h2>
				<button type="button" onclick={() => (cancelling = true)} class="btn-secondary sm:!w-auto sm:px-6">Cancel this request</button>
			</section>
		{/if}

		{#if cancelling}
			<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="cx-title">
				<div class="card flex w-full max-w-md flex-col gap-4 p-6">
					<h2 id="cx-title" class="text-xl font-bold">Cancel request {d.number}?</h2>
					<p class="text-[15px] leading-[22px] text-muted">The facility will be told. You can send a new request later.</p>
					<div class="flex flex-col gap-2">
						<label for="why" class="field-label">Reason <span class="font-normal text-muted">(optional)</span></label>
						<select id="why" bind:value={reason} class="field-input">
							<option value="">Choose a reason</option>
							{#each ['Blood is no longer needed', 'The patient was moved', 'Found blood another way', 'Sent by mistake'] as r}<option>{r}</option>{/each}
						</select>
					</div>
					<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
						<button type="button" onclick={() => (cancelling = false)} class="btn-secondary sm:!w-auto sm:px-6">Keep request</button>
						<button type="button" onclick={cancel} class="btn-danger sm:!w-auto sm:px-6" disabled={busy}>Cancel request</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</AccountShell>
