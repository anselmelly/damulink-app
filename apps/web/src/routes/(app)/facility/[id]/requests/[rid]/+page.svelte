<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { BLOOD_CHOICES, REJECT_CHOICES, REJECT_REASON_TEXT, REQUEST_STATUS, neededAt, plural, relationLabel, sentAt } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { FacilityRequestDetail, MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	const rid = $derived(page.params.rid)
	let f = $state<MyFacilityView | null>(null)
	let d = $state<FacilityRequestDetail | null>(null)
	let missing = $state(false)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	// step 1 values, filled from what was sent
	let bloodType = $state('')
	let units = $state(1)
	let urgency = $state<'normal' | 'urgent' | 'surge'>('normal')
	let verifiedWard = $state(false)
	// dialogs
	let dialog = $state<'reject' | 'ask' | null>(null)
	let reason = $state('no_match')
	let message = $state('')
	let question = $state('')

	function fill(r: FacilityRequestDetail) {
		d = r
		bloodType = r.blood?.bloodType ?? (r.bloodTypeAsked === 'unsure' ? '' : r.bloodTypeAsked)
		units = r.blood?.units ?? r.unitsAsked
		urgency = (r.blood?.urgency ?? r.urgencyAsked) as typeof urgency
	}
	const load = async () => fill(await auth.call<FacilityRequestDetail>(`/my-facilities/${id}/requests/${rid}`))
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {
			missing = true
		}
	})

	/** Runs one action and reloads the request; shows the API's message when it is refused. */
	async function act(what: string, body?: unknown) {
		error = ''
		errors = {}
		busy = true
		try {
			await auth.call(`/my-facilities/${id}/requests/${rid}/${what}`, { body: body ?? {} })
			dialog = null
			message = question = ''
			await load()
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			error = err instanceof ApiError ? err.message : 'Something went wrong.'
			if (err instanceof ApiError && err.code === 'invalid_move') await load().catch(() => {}) // someone else got there first
		} finally {
			busy = false
		}
	}
	const confirmIt = (e: SubmitEvent) => {
		e.preventDefault()
		if (!bloodType) return void (errors = { bloodType: 'Choose the blood type the ward confirms' })
		if (!verifiedWard) return void (errors = { ward: 'Please confirm the patient is admitted and needs this blood' })
		return act('confirm', { bloodType, units, urgency })
	}
	const verifiedFacility = $derived(f?.status === 'verified')
	const STEPS: [string, string[]][] = [['Pending', ['pending', 'needs_info']], ['Confirmed offline', ['confirmed']], ['Approved', ['approved', 'published', 'closed']], ['Not approved', ['rejected']]]
</script>

<svelte:head><title>{d ? d.number : 'Request'} | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="requests">
	<a href="/facility/{id}/requests" class="link inline-flex items-center gap-1 self-start text-[15px]"><Icon name="chev-l" class="h-5 w-5" />Requests</a>

	{#if missing}
		<div class="card p-8 text-center"><h1 class="text-xl font-bold">Request not found</h1><p class="mt-2 text-muted">It may belong to another facility.</p></div>
	{:else if !d}
		<p class="text-muted" role="status">Loading…</p>
	{:else}
		<header class="flex flex-col gap-3">
			<p class="text-[13px] font-semibold text-muted">{d.number} · {d.source === 'facility' ? 'Raised here' : 'Sent'} {sentAt(d.createdAt)}</p>
			<div class="flex flex-wrap items-center gap-3">
				<BloodChip type={d.blood?.bloodType ?? d.bloodTypeAsked} />
				<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">{(d.blood?.bloodType ?? d.bloodTypeAsked) === 'unsure' ? 'Blood' : `${d.blood?.bloodType ?? d.bloodTypeAsked} blood`}, {plural(d.blood?.units ?? d.unitsAsked, 'unit')}</h1>
				{#if (d.blood?.urgency ?? d.urgencyAsked) !== 'normal'}<span class="badge badge-urgent capitalize">{d.blood?.urgency ?? d.urgencyAsked}</span>{/if}
				<span class="badge {REQUEST_STATUS[d.status][0]}">{REQUEST_STATUS[d.status][1]}</span>
			</div>
			<ol class="flex flex-wrap gap-x-6 gap-y-2 text-[14px]" aria-label="Progress">
				{#each STEPS as [label, statuses]}<li class="flex items-center gap-2 {statuses.includes(d.status) ? 'font-bold text-red-700' : 'text-muted'}"><span class="h-2.5 w-2.5 rounded-full {statuses.includes(d.status) ? 'bg-rose-600' : 'bg-rose-200'}"></span>{label}</li>{/each}
			</ol>
		</header>

		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		<div class="grid items-start gap-6 xl:grid-cols-2">
			<section class="card flex flex-col gap-4 p-6 md:p-8">
				<h2 class="text-lg font-bold">What {d.source === 'facility' ? 'was entered' : 'the requester sent'}</h2>
				<p class="flex items-center gap-2 text-[14px] text-muted"><Icon name="lock" class="h-4 w-4" />Patient details are private to your facility.</p>
				<dl class="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-[170px_1fr]">
					<dt class="text-muted">Patient</dt><dd>{d.patientName ?? 'No name given'}</dd>
					<dt class="text-muted">Ward and bed</dt><dd>{d.patientRef}</dd>
					<dt class="text-muted">Blood type (as sent)</dt><dd>{d.bloodTypeAsked === 'unsure' ? 'Not sure' : d.bloodTypeAsked}</dd>
					<dt class="text-muted">Units</dt><dd>{d.unitsAsked}</dd>
					<dt class="text-muted">Needed by</dt><dd>{neededAt(d.neededBy)}</dd>
					<dt class="text-muted">Urgency (as sent)</dt><dd class="capitalize">{d.urgencyAsked}</dd>
					{#if d.note}<dt class="text-muted">Note</dt><dd>{d.note}</dd>{/if}
					{#if d.internalNote}<dt class="text-muted">Internal note</dt><dd>{d.internalNote}</dd>{/if}
				</dl>
			</section>

			<div class="flex flex-col gap-6">
				{#if d.requester}
					<section class="card flex flex-col gap-3 p-6 md:p-8">
						<h2 class="text-lg font-bold">Requester</h2>
						<p class="font-bold">{d.requester.name}</p>
						<p class="text-[15px] text-muted">{relationLabel(d.relation)} of the patient · Phone verified</p>
						<p class="flex items-center gap-2 text-[15px]"><Icon name="phone" class="h-4 w-4 text-muted" />{d.requester.phone}</p>
						<p class="notice text-[14px] leading-5"><Icon name="info" class="mt-px h-5 w-5 shrink-0" />This is the requester's {d.requester.total}{['th', 'st', 'nd', 'rd'][d.requester.total % 10 < 4 && ![11, 12, 13].includes(d.requester.total % 100) ? d.requester.total % 10 : 0]} request: {d.requester.rejected} rejected, {d.requester.cancelled} cancelled.</p>
					</section>
				{/if}
				<section class="card flex flex-col gap-3 p-6 md:p-8" aria-label="History">
					<h2 class="text-lg font-bold">History</h2>
					<ol class="flex flex-col gap-3 text-[15px]">
						{#each d.timeline as e}<li class="flex flex-wrap gap-x-3"><span class="w-36 shrink-0 text-muted">{sentAt(e.at)}</span><span><span class="font-semibold capitalize">{e.kind}</span>{#if e.text}<span class="text-muted"> · {e.text}</span>{/if}</span></li>{/each}
					</ol>
				</section>
			</div>
		</div>

		{#if !verifiedFacility}
			<p class="notice"><Icon name="info" class="mt-px h-5 w-5 shrink-0" />This facility must be verified before requests can be decided.</p>
		{:else if d.status === 'pending'}
			<form onsubmit={confirmIt} novalidate class="card flex flex-col gap-5 p-6 md:p-8">
				<div><p class="eyebrow">Step 1</p><h2 class="text-xl font-bold">Confirm with the ward</h2><p class="mt-1 text-[15px] text-muted">Check the admission offline, call the requester if needed, then enter what the ward confirms.</p></div>
				<div class="flex flex-col gap-2">
					<span class="field-label" id="cbt">Blood type</span>
					<div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="cbt">{#each BLOOD_CHOICES as b}<label><input type="radio" name="cbt" value={b} bind:group={bloodType} class="peer sr-only" /><span class="seg-box">{b}</span></label>{/each}</div>
					{#if errors.bloodType}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.bloodType}</span>{/if}
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-2"><label for="cu" class="field-label">Units</label><input id="cu" type="number" min="1" max="10" bind:value={units} class="field-input" /></div>
					<div class="flex flex-col gap-2"><span class="field-label" id="cur">Urgency</span><div class="flex gap-2" role="radiogroup" aria-labelledby="cur">{#each [['normal', 'Normal'], ['urgent', 'Urgent'], ['surge', 'Surge']] as [v, l]}<label><input type="radio" name="cur" value={v} bind:group={urgency} class="peer sr-only" /><span class="seg-box">{l}</span></label>{/each}</div></div>
				</div>
				<label class="flex items-start gap-3 text-[15px] leading-[22px]"><input type="checkbox" bind:checked={verifiedWard} class="mt-0.5 h-5 w-5 shrink-0 accent-rose-600" /><span>I confirmed this patient is admitted and needs this blood.</span></label>
				{#if errors.ward}<span class="field-error -mt-3"><Icon name="alert" class="h-4 w-4" />{errors.ward}</span>{/if}
				<div class="flex flex-col gap-3 sm:flex-row">
					<button class="btn-primary sm:!w-auto sm:px-8" disabled={busy}>Mark confirmed offline</button>
					<button type="button" onclick={() => (dialog = 'ask')} class="btn-secondary sm:!w-auto sm:px-6">Ask for more</button>
					{#if d.canDecide}<button type="button" onclick={() => (dialog = 'reject')} class="btn-secondary sm:!w-auto sm:px-6">Reject</button>{/if}
				</div>
			</form>
		{:else if d.status === 'confirmed'}
			<section class="card flex flex-col gap-4 p-6 md:p-8">
				<div><p class="eyebrow">Step 2</p><h2 class="text-xl font-bold">Approve this request</h2><p class="mt-1 text-[15px] text-muted">Confirmed: {d.blood?.bloodType}, {plural(d.blood?.units ?? 0, 'unit')}, {d.blood?.urgency}. After approval you choose whether to publish a call and alert donors.</p></div>
				{#if d.canDecide}
					<div class="flex flex-col gap-3 sm:flex-row">
						<button type="button" onclick={() => act('approve')} class="btn-primary sm:!w-auto sm:px-8" disabled={busy}>Approve</button>
						<button type="button" onclick={() => (dialog = 'ask')} class="btn-secondary sm:!w-auto sm:px-6">Ask for more</button>
						<button type="button" onclick={() => (dialog = 'reject')} class="btn-secondary sm:!w-auto sm:px-6">Reject</button>
					</div>
				{:else}
					<p class="notice"><Icon name="info" class="mt-px h-5 w-5 shrink-0" />An admin, or an attendant with approval permission, approves requests. You can ask the requester for more information.</p>
					<button type="button" onclick={() => (dialog = 'ask')} class="btn-secondary self-start sm:!w-auto sm:px-6">Ask for more</button>
				{/if}
			</section>
		{:else if d.status === 'needs_info'}
			<section class="card flex flex-col gap-2 p-6 md:p-8"><h2 class="text-lg font-bold">Waiting for the requester</h2><p class="text-[15px] text-muted">You asked: "{d.question}". The request returns to Pending when they reply.</p></section>
		{:else if d.status === 'approved'}
			<section class="card flex flex-col gap-3 p-6 md:p-8"><h2 class="flex items-center gap-2 text-xl font-bold"><Icon name="check" class="h-6 w-6 text-green-700" />Approved</h2><p class="text-[15px] text-muted">Publishing a call and alerting donors comes in the next phase. For now the request stays approved.</p><button type="button" disabled class="btn-secondary self-start opacity-60 sm:!w-auto sm:px-6" title="Coming next">Publish or alert donors</button></section>
		{:else if d.status === 'rejected'}
			<section class="card flex flex-col gap-2 p-6 md:p-8"><h2 class="flex items-center gap-2 text-xl font-bold"><Icon name="x" class="h-6 w-6 text-red-700" />Rejected</h2><p class="text-[15px]">{REJECT_REASON_TEXT[d.rejectReason ?? 'other']}</p>{#if d.rejectMessage}<p class="text-[15px] text-muted">{d.rejectMessage}</p>{/if}<p class="text-[14px] text-muted">The requester can see this reason.</p></section>
		{/if}

		{#if dialog === 'reject'}
			<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="rj-title">
				<div class="card flex w-full max-w-md flex-col gap-4 p-6">
					<h2 id="rj-title" class="text-xl font-bold">Reject this request?</h2>
					<p class="text-[15px] leading-[22px] text-muted">The requester sees your reason. Be clear and kind, and never name the patient.</p>
					<div class="flex flex-col gap-2"><label for="rr" class="field-label">Reason</label><select id="rr" bind:value={reason} class="field-input">{#each REJECT_CHOICES as [k, l]}<option value={k}>{l}</option>{/each}</select></div>
					<div class="flex flex-col gap-2"><label for="rm" class="field-label">Message to the requester <span class="font-normal text-muted">(optional)</span></label><textarea id="rm" rows="3" maxlength="500" bind:value={message} class="field-input"></textarea></div>
					<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onclick={() => (dialog = null)} class="btn-secondary sm:!w-auto sm:px-6">Cancel</button><button type="button" onclick={() => act('reject', { reason, message: message || undefined })} class="btn-danger sm:!w-auto sm:px-6" disabled={busy}>Reject request</button></div>
				</div>
			</div>
		{:else if dialog === 'ask'}
			<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ak-title">
				<div class="card flex w-full max-w-md flex-col gap-4 p-6">
					<h2 id="ak-title" class="text-xl font-bold">Ask for more information</h2>
					<p class="text-[15px] leading-[22px] text-muted">The request stays open. The requester gets your question and can reply.</p>
					<div class="flex flex-col gap-2"><label for="aq" class="field-label">Your question</label><textarea id="aq" rows="3" maxlength="500" bind:value={question} class="field-input {errors.question ? 'is-error' : ''}"></textarea>{#if errors.question}<span class="field-error">{errors.question}</span>{/if}</div>
					<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onclick={() => (dialog = null)} class="btn-secondary sm:!w-auto sm:px-6">Cancel</button><button type="button" onclick={() => act('ask', { question })} class="btn-primary sm:!w-auto sm:px-6" disabled={busy || !question.trim()}>Send question</button></div>
				</div>
			</div>
		{/if}
	{/if}
</FacilityShell>
