<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import { BLOOD_CHOICES, todayNairobi } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import TextField from '$lib/ui/TextField.svelte'
	import { addMonths, type CheckinCard, type MyFacilityView, type OutcomeResult, type RecentRequest } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let code = $state('')
	let card = $state<CheckinCard | null>(null)
	let notFound = $state(false)
	let saved = $state<OutcomeResult | null>(null)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	let tab = $state<'donated' | 'test' | 'deferred' | 'no_show'>('donated')
	let weight = $state('')
	let bag = $state('')
	let callId = $state('')
	let testType = $state<'now' | 'later'>('now')
	let bloodType = $state('')
	let pauseUntil = $state('')
	let recent = $state<RecentRequest[]>([])
	const loadRecent = async () => (recent = await auth.call<RecentRequest[]>(`/my-facilities/${id}/checkin-recent`).catch(() => []))
	const shown = $derived(recent.filter((r) => !code.trim() || `${r.name} ${r.code}`.toLowerCase().includes(code.trim().toLowerCase())))
	const clock = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })

	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
		} catch {}
		await loadRecent()
		const q = page.url.searchParams.get('code')
		if (q) {
			code = q
			void find()
		}
	})

	const reset = () => {
		card = null
		saved = null
		notFound = false
		code = ''
		error = ''
		errors = {}
		weight = bag = callId = bloodType = ''
		testType = 'now'
		void loadRecent()
	}
	async function find(e?: SubmitEvent) {
		e?.preventDefault()
		if (!code.trim()) return
		busy = true
		error = ''
		notFound = false
		try {
			card = await auth.call<CheckinCard>(`/my-facilities/${id}/checkin/${encodeURIComponent(code.trim())}`)
			tab = card.eligibility.status === 'eligible' ? 'donated' : 'test'
			weight = ''
			pauseUntil = addMonths(todayNairobi(), 3)
		} catch (err) {
			if (err instanceof ApiError && err.status === 404) notFound = true
			else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	async function record(e: SubmitEvent) {
		e.preventDefault()
		if (!card) return
		busy = true
		error = ''
		errors = {}
		const w = weight.trim() ? Number(weight) : undefined
		const body =
			tab === 'donated' ? { outcome: tab, weightKg: w, bagNumber: bag || undefined, callId: callId || undefined }
			: tab === 'test' ? { outcome: tab, weightKg: w, bloodType: testType === 'later' ? 'later' : bloodType }
			: tab === 'deferred' ? { outcome: tab, returnAfter: pauseUntil || undefined }
			: { outcome: tab }
		try {
			saved = await auth.call<OutcomeResult>(`/my-facilities/${id}/checkin/${encodeURIComponent(card.code)}/outcome`, { body })
		} catch (err) {
			if (err instanceof ApiError) {
				errors = err.fields
				error = err.code === 'not_eligible' || !Object.keys(err.fields).length ? err.message : ''
			} else error = 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	const TABS: [typeof tab, string][] = [['donated', 'Donated'], ['test', 'Test only'], ['deferred', 'Deferred'], ['no_show', 'Did not attend']]
	const when = $derived(card?.eligibility.eligibleOn ? longDate(card.eligibility.eligibleOn) : '')
</script>

<svelte:head><title>Check-in | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="checkin">
	<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">Check in a donor</h1>

	{#if saved && card}
		<div class="card flex flex-col gap-4 p-6" role="status">
			<h2 class="flex items-center gap-2 text-xl font-extrabold"><Icon name="check" class="h-6 w-6 text-emerald-700" />{saved.outcome === 'donated' ? 'Donation recorded' : saved.outcome === 'test' ? 'Test recorded' : saved.outcome === 'deferred' ? 'Deferral recorded' : 'Marked as did not attend'}</h2>
			{#if saved.nextEligibleOn}<p>{card.name} can donate again from <strong>{longDate(saved.nextEligibleOn)}</strong>.</p>{/if}
			{#if saved.verified}<p>{card.name} is now verified.</p>{/if}
			{#if saved.warning}<p class="badge badge-warn">Weight is under 50 kg. The facility decides.</p>{/if}
			{#if saved.call}<p>Counts toward {saved.call.number}: {saved.call.donated} of {saved.call.needed} donated.</p>{/if}
			<button type="button" class="btn-primary sm:w-auto sm:px-8" onclick={reset}>Next donor</button>
		</div>
	{:else if card}
		<div class="card flex flex-col gap-4 p-6">
			<div class="flex items-center gap-4">
				<BloodChip type={card.bloodType ?? '?'} />
				<div class="min-w-0 flex-1">
					<p class="text-lg font-extrabold">{card.name}</p>
					<p class="text-[14px] text-muted">{card.sex === 'female' ? 'Female' : 'Male'} · {card.age} years · {card.code}</p>
				</div>
				<span class="badge {card.verified ? 'badge-ok' : 'badge-neutral'}">{card.verified ? 'Verified' : 'Registered, not verified'}</span>
			</div>
			<dl class="grid grid-cols-3 gap-3 text-[14px]">
				<div><dt class="text-muted">Weight</dt><dd class="font-semibold">{card.weightKg != null ? `${card.weightKg} kg` : 'Not recorded'}</dd></div>
				<div><dt class="text-muted">Last donation</dt><dd class="font-semibold">{card.lastDonationOn ? longDate(card.lastDonationOn) : 'None yet'}</dd></div>
				<div><dt class="text-muted">Donations recorded</dt><dd class="font-semibold">{card.donations}</dd></div>
			</dl>
			<p class="font-bold {card.eligibility.status === 'eligible' ? 'text-emerald-800' : 'text-amber-900'}">{card.eligibility.status === 'eligible' ? 'Likely eligible today' : card.eligibility.status === 'waiting' ? `Not eligible until ${when}` : 'Not eligible to donate'}</p>
			<ul class="flex flex-col gap-1 text-[14px]">
				{#each card.checks as c}<li class="flex gap-2"><Icon name={c.ok ? 'check' : 'alert'} class="h-5 w-5 shrink-0 {c.ok ? 'text-emerald-700' : c.advisory ? 'text-amber-700' : 'text-red-700'}" /><span><strong>{c.key === 'age' ? 'Age' : c.key === 'weight' ? 'Weight' : 'Waiting period'}:</strong> {c.text}</span></li>{/each}
			</ul>
			<p class="field-help">A guide only. Your own screening today has the final say.</p>
			{#if card.appointment}<p class="badge badge-soft self-start">Booked visit: {card.appointment.kind === 'donate' ? 'donation' : 'test'}</p>{/if}
		</div>

		<form class="card flex flex-col gap-5 p-6" onsubmit={record}>
			<h2 class="text-xl font-extrabold">Record the outcome</h2>
			<div class="flex flex-wrap gap-2" role="tablist">
				{#each TABS as [k, l]}<button type="button" role="tab" aria-selected={tab === k} onclick={() => { tab = k; error = ''; errors = {} }} class="h-11 rounded-xl border-[1.5px] px-5 font-semibold {tab === k ? 'border-rose-600 bg-rose-50 text-red-700' : 'border-field bg-white'}">{l}</button>{/each}
			</div>

			{#if tab === 'donated'}
				<TextField id="weight" label="Weight today (kg), optional" bind:value={weight} inputmode="numeric" error={errors.weightKg ?? ''} help="Under 50 kg shows a warning and the facility decides." />
				<TextField id="bag" label="Bag or sample number, optional" bind:value={bag} />
				<div class="flex flex-col gap-2">
					<label for="callId" class="field-label">Counts toward a call</label>
					<select id="callId" bind:value={callId} class="field-input">
						<option value="">No call, general donation</option>
						{#each card.calls as c}<option value={c.id}>{c.number}: {c.bloodType}, needs {c.needed} more</option>{/each}
					</select>
					{#if errors.callId}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.callId}</span>{/if}
				</div>
			{:else if tab === 'test'}
				<div class="flex gap-2">
					{#each [['now', 'Enter the blood type now'], ['later', 'Result comes later from the lab']] as [k, l]}<label class="flex-1"><input type="radio" class="peer sr-only" name="tt" value={k} checked={testType === k} onchange={() => (testType = k as typeof testType)} /><span class="seg-box text-center text-[14px]">{l}</span></label>{/each}
				</div>
				{#if testType === 'now'}
					<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Blood type">
						{#each BLOOD_CHOICES as b}<label><input type="radio" class="peer sr-only" name="bt" value={b} checked={bloodType === b} onchange={() => (bloodType = b)} /><span class="seg-box">{b}</span></label>{/each}
					</div>
					{#if errors.bloodType}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.bloodType}</span>{/if}
				{/if}
				<p class="field-help">The donor becomes verified once a blood type is entered, now or from the lab results list.</p>
			{:else if tab === 'deferred'}
				<div class="flex flex-col gap-2">
					<label for="pause" class="field-label">Pause alerts until, optional</label>
					<input id="pause" type="date" min={todayNairobi()} bind:value={pauseUntil} class="field-input {errors.returnAfter ? 'is-error' : ''}" />
					{#if errors.returnAfter}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.returnAfter}</span>{:else}<span class="field-help">No alerts until this date. Clear it for no pause. No reason is stored or shown.</span>{/if}
				</div>
			{:else}
				<p class="text-muted">Marks the booked visit as missed. There is no penalty, and the donor can book again any time.</p>
			{/if}

			{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
			<div class="flex flex-col gap-3 sm:flex-row">
				<button class="btn-primary sm:w-auto sm:px-8" disabled={busy || (tab === 'test' && testType === 'now' && !bloodType)}>{busy ? 'Saving…' : tab === 'donated' ? 'Record donation' : tab === 'test' ? 'Record test' : tab === 'deferred' ? 'Record deferral' : 'Mark as did not attend'}</button>
				<button type="button" class="btn-secondary sm:w-auto sm:px-8" onclick={reset}>Cancel</button>
				<a class="link self-center" href="/facility/{id}/records/{encodeURIComponent(card.code)}">Correct a record</a>
			</div>
		</form>
	{:else}
		<form class="card flex flex-col gap-5 p-6" onsubmit={find}>
			<TextField id="code" label="Donor code" bind:value={code} placeholder={`${BRAND.codePrefix}-XXXX-XX`} help="Ask the donor to show the code on their dashboard." />
			{#if notFound}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />No donor with that code. Check the characters, or add them as a walk-in.</p>{/if}
			{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
			<button class="btn-primary sm:w-auto sm:px-8" disabled={busy || !code.trim()}>{busy ? 'Looking…' : 'Find donor'}</button>
			<p class="text-[14px] text-muted">No code on hand? <a class="link" href="/facility/{id}/walkin">Add a walk-in</a> instead.</p>
		</form>
		<section class="flex flex-col gap-3" aria-labelledby="recent-h">
			<h2 id="recent-h" class="text-lg font-extrabold">Recent appointment requests</h2>
			{#if !recent.length}
				<p class="card p-5 text-muted" role="status">No appointment requests waiting. Donors who ask to come to this facility show up here.</p>
			{:else if !shown.length}
				<p class="card p-5 text-muted" role="status">No request matches what you typed.</p>
			{:else}
				<ul class="card divide-y divide-rose-100">
					{#each shown as r (r.id)}
						<li><button type="button" class="flex w-full items-center gap-3 p-4 text-left hover:bg-rose-50" onclick={() => { code = r.code; void find() }}>
							<span class="min-w-0 flex-1"><span class="block font-semibold">{r.name}</span><span class="block text-[13px] text-muted">{r.code} · {r.kind === 'donate' ? 'Donation' : 'Blood type test'} · asked {clock(r.at)}{r.scheduledAt ? ` · booked ${clock(r.scheduledAt)}` : ''}</span></span>
							<span class="badge {r.status === 'scheduled' ? 'badge-ok' : 'badge-soft'}">{r.status === 'scheduled' ? 'Booked' : 'Requested'}</span>
						</button></li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</FacilityShell>
