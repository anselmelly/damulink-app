<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { nairobiDateTime } from '$lib/dates'
	import { ago, toIso, todayNairobi } from '$lib/requests'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import { DECLINE_REASONS, type DeclineReason, type DonorRequestItem, type DonorRequestList, type MyFacilityView, type RequestTab } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let tab = $state<RequestTab>('follow_up')
	let data = $state<DonorRequestList | null>(null)
	let loaded = $state(false)
	let dialog = $state<{ kind: 'date' | 'decline' | 'cancel'; item: DonorRequestItem } | null>(null)
	let date = $state('')
	let time = $state('09:00')
	let reason = $state<DeclineReason>('no_capacity')
	let note = $state('')
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	let notice = $state('')

	const base = $derived(`/my-facilities/${id}/donor-requests`)
	const load = async () => (data = await auth.call<DonorRequestList>(`${base}?tab=${tab}`))
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {}
		loaded = true
	})
	const pick = async (t: RequestTab) => {
		tab = t
		notice = ''
		await load().catch(() => {})
	}
	const open = (kind: 'date' | 'decline' | 'cancel', item: DonorRequestItem) => {
		dialog = { kind, item }
		error = ''
		errors = {}
		reason = 'no_capacity'
		note = ''
		if (kind === 'date') {
			date = item.scheduledAt ? new Date(new Date(item.scheduledAt).getTime() + 3 * 3600_000).toISOString().slice(0, 10) : todayNairobi()
			time = item.scheduledAt ? new Date(new Date(item.scheduledAt).getTime() + 3 * 3600_000).toISOString().slice(11, 16) : '09:00'
		}
	}
	async function submit(e: SubmitEvent) {
		e.preventDefault()
		if (!dialog) return
		busy = true
		error = ''
		errors = {}
		const { kind, item } = dialog
		try {
			const r = await auth.call<{ warning?: string }>(`${base}/${item.id}/${kind === 'date' ? 'schedule' : kind}`, { body: kind === 'date' ? { scheduledAt: toIso(date, time) } : { reason, note: note || undefined } })
			notice = kind === 'date' ? `${item.name} is booked. They were texted the time.${r.warning === 'busy' ? ' Note: that hour is already busy.' : ''}` : `${item.name} was told the visit cannot go ahead.`
			dialog = null
			await load()
		} catch (err) {
			if (err instanceof ApiError) {
				errors = err.fields
				error = Object.keys(err.fields).length ? '' : err.message
			} else error = 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	const DAY: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
	const WHEN: Record<string, string> = { morning: 'mornings', afternoon: 'afternoons', any: 'any time' }
	const TABS: [RequestTab, string][] = [['follow_up', 'To follow up'], ['scheduled', 'Scheduled'], ['past', 'Past']]
</script>

<svelte:head><title>Donor requests | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="donor-requests">
	<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">Donor requests</h1>
	<p class="text-muted">Donors asking to come here to donate or get their blood type tested. Set a date and they are texted.</p>
	<div class="flex flex-wrap gap-2" role="tablist">
		{#each TABS as [k, l]}<button type="button" role="tab" aria-selected={tab === k} onclick={() => pick(k)} class="h-11 rounded-xl border-[1.5px] px-5 font-semibold {tab === k ? 'border-rose-600 bg-rose-50 text-red-700' : 'border-field bg-white'}">{l}{#if data}<span class="ml-2 text-[13px] opacity-80">{data.counts[k]}</span>{/if}</button>{/each}
	</div>
	{#if notice}<p class="card flex items-center gap-2 p-4 font-semibold text-emerald-800" role="status"><Icon name="check" class="h-5 w-5" />{notice}</p>{/if}

	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if !data?.items.length}
		<div class="card p-8 text-center text-muted">{tab === 'follow_up' ? 'Nothing to follow up.' : tab === 'scheduled' ? 'No visits booked.' : 'No past requests.'}</div>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each data.items as r (r.id)}
				<li class="card flex flex-col gap-3 p-5">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-bold">{r.name}</span>
						<span class="badge badge-soft">{r.kind === 'donate' ? 'Donation' : 'Blood type test'}</span>
						<span class="badge {r.verified ? 'badge-ok' : 'badge-neutral'}">{r.verified ? 'Verified' : 'Not verified'}</span>
						{#if r.rescheduleAsked}<span class="badge badge-warn">Asked to move</span>{/if}
						{#if r.status === 'cancelled'}<span class="badge badge-neutral">{r.cancelledBy === 'facility' ? 'Declined' : 'Cancelled by donor'}</span>{:else if r.status === 'completed'}<span class="badge badge-ok">Done</span>{:else if r.status === 'no_show'}<span class="badge badge-neutral">Did not attend</span>{/if}
					</div>
					<p class="text-[14px] text-muted">{r.code} · asked {ago(r.askedAt)}{#if r.status === 'requested'} · prefers {r.days.map((d) => DAY[d]).join(', ')}, {WHEN[r.timeOfDay]}{/if}{#if r.scheduledAt} · {nairobiDateTime(r.scheduledAt)}{/if}</p>
					{#if r.note}<p class="text-[14px]">{r.note}</p>{/if}
					<div class="flex flex-wrap gap-2">
						{#if r.status === 'requested' || (r.status === 'scheduled' && tab === 'follow_up')}
							<button type="button" class="btn-primary w-auto px-6" onclick={() => open('date', r)}>{r.status === 'scheduled' ? 'Set a new time' : 'Set a date'}</button>
						{/if}
						{#if r.status === 'requested'}<button type="button" class="btn-danger" onclick={() => open('decline', r)}>Decline</button>{/if}
						{#if r.status === 'scheduled'}
							{#if tab === 'scheduled'}<button type="button" class="btn-secondary w-auto px-6" onclick={() => open('date', r)}>Reschedule</button>{/if}
							<a class="btn-secondary w-auto px-6" href="/facility/{id}/checkin?code={encodeURIComponent(r.code)}">Check in</a>
							<button type="button" class="btn-danger" onclick={() => open('cancel', r)}>Cancel visit</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</FacilityShell>

{#if dialog}
	<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
		<form class="card flex w-full max-w-md flex-col gap-4 p-6" onsubmit={submit}>
			<h2 id="dlg-h" class="text-xl font-extrabold">{dialog.kind === 'date' ? `Set a date for ${dialog.item.name}` : dialog.kind === 'decline' ? `Decline ${dialog.item.name}` : `Cancel ${dialog.item.name}'s visit`}</h2>
			{#if dialog.kind === 'date'}
				<div class="flex flex-col gap-2"><label for="d" class="field-label">Date</label><input id="d" type="date" min={todayNairobi()} bind:value={date} class="field-input {errors.scheduledAt ? 'is-error' : ''}" /></div>
				<div class="flex flex-col gap-2"><label for="tm" class="field-label">Time (Nairobi)</label><input id="tm" type="time" bind:value={time} class="field-input" /></div>
				{#if errors.scheduledAt}<p class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.scheduledAt}</p>{/if}
				<p class="field-help">The donor gets a text with the date, the place and their donor code.</p>
			{:else}
				<fieldset class="flex flex-col gap-2"><legend class="field-label">Reason the donor will be told</legend>
					{#each Object.entries(DECLINE_REASONS) as [k, l]}<label class="flex items-center gap-3"><input type="radio" name="reason" value={k} checked={reason === k} onchange={() => (reason = k as DeclineReason)} class="h-5 w-5" />{l}</label>{/each}
				</fieldset>
				{#if reason === 'other'}
					<div class="flex flex-col gap-2"><label for="note" class="field-label">Short note (shown to the donor)</label><input id="note" bind:value={note} maxlength="200" class="field-input {errors.note ? 'is-error' : ''}" />{#if errors.note}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.note}</span>{/if}</div>
				{/if}
				<p class="field-help">Never give a health reason. Only the reason above is shown.</p>
			{/if}
			{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
			<div class="flex gap-3"><button class="btn-primary w-auto px-8" disabled={busy}>{busy ? 'Saving…' : dialog.kind === 'date' ? 'Book and text' : 'Send'}</button><button type="button" class="btn-secondary w-auto px-8" onclick={() => (dialog = null)}>Back</button></div>
		</form>
	</div>
{/if}
