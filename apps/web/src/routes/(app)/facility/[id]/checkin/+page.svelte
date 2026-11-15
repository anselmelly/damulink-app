<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import { BLOOD_CHOICES, todayNairobi } from '$lib/requests'
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
	let step = $state<'card' | 'outcome'>('card')
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
		step = 'card'
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
				step = 'card'
				saved = null
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

<FacilityShell {f} width="narrow" active="checkin">
	{#if step === 'outcome' && card}
		<a href="#back" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]" onclick={(e) => { e.preventDefault(); step = 'card'; saved = null }}><Icon name="chev-l" class="h-[22px] w-[22px]" />Check-in</a>
		<header class="flex flex-col gap-3">
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Record the outcome</h1>
			<div class="card flex items-center gap-4 p-4">
				<span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-xl font-extrabold text-white">{card.bloodType ?? '?'}</span>
				<span class="leading-5"><span class="block text-lg font-bold">{card.name}</span><span class="block text-[13px] text-muted">{card.code} · {card.sex === 'female' ? 'Female' : 'Male'} · {card.age} · {card.verified ? 'Verified' : 'Registered'}{card.lastDonationOn ? ` · last donated ${longDate(card.lastDonationOn)}` : ''}</span></span>
			</div>
		</header>

		{#if saved}
			<section class="card flex flex-col items-center gap-4 p-8 text-center md:p-12" role="status">
				<span class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white"><Icon name="check" class="h-8 w-8" /></span>
				<h2 class="text-[26px] font-extrabold leading-8 tracking-tight">{saved.outcome === 'donated' ? 'Donation recorded' : saved.outcome === 'test' ? 'Test recorded' : saved.outcome === 'deferred' ? 'Deferral recorded' : 'Marked as did not attend'}</h2>
				<div class="flex max-w-md flex-col gap-2 text-base leading-6 text-muted">
					{#if saved.nextEligibleOn}<p>{card.name} can donate again from <strong class="font-bold text-ink">{longDate(saved.nextEligibleOn)}</strong>.</p>{/if}
					{#if saved.verified}<p>{card.name} is now verified.</p>{/if}
					{#if saved.warning}<p class="badge badge-warn self-center">Weight is under 50 kg. The facility decides.</p>{/if}
					{#if saved.call}<p>Counts toward {saved.call.number}: {saved.call.donated} of {saved.call.needed} donated.</p>{/if}
				</div>
				<div class="mt-2 flex w-full max-w-sm flex-col gap-3"><button type="button" class="btn-primary" onclick={reset}>Next donor</button></div>
			</section>
		{:else}
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Outcome">
				{#each TABS as [k, l]}<button type="button" role="tab" aria-selected={tab === k} onclick={() => { tab = k; error = ''; errors = {} }} class="flex h-[52px] items-center justify-center rounded-xl border-[1.5px] text-[15px] font-semibold hover:bg-rose-50 {tab === k ? 'border-rose-600 bg-rose-50 text-red-700' : 'border-field bg-white text-ink'}">{l}</button>{/each}
			</div>

			<form class="card flex flex-col gap-5 p-6 md:p-8" onsubmit={record}>
				{#if tab === 'donated'}
					<h2 class="text-xl font-bold">Donation</h2>
					<div class="grid gap-5 sm:grid-cols-2">
						<TextField id="weight" label="Weight today (kg), optional" bind:value={weight} inputmode="numeric" error={errors.weightKg ?? ''} help="Optional. Recorded for the record; under 50 kg shows a warning and the facility decides." />
						<TextField id="bag" label="Bag or sample number, optional" bind:value={bag} />
					</div>
					<div class="flex flex-col gap-2">
						<label for="callId" class="field-label">Counts toward a call</label>
						<select id="callId" bind:value={callId} class="field-input">
							<option value="">No call, general donation</option>
							{#each card.calls as c}<option value={c.id}>{c.number}: {c.bloodType}, needs {c.needed} more</option>{/each}
						</select>
						{#if errors.callId}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.callId}</span>{/if}
					</div>
					<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Next eligible date is worked out for you: 4 months for women, 3 months for men.</p></div>
				{:else if tab === 'test'}
					<h2 class="text-xl font-bold">Blood type test</h2>
					<div class="flex gap-2">
						{#each [['now', 'Enter the blood type now'], ['later', 'Result comes later from the lab']] as [k, l]}<label class="flex-1"><input type="radio" class="peer sr-only" name="tt" value={k} checked={testType === k} onchange={() => (testType = k as typeof testType)} /><span class="seg-box text-center text-[14px]">{l}</span></label>{/each}
					</div>
					{#if testType === 'now'}
						<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Blood type">
							{#each BLOOD_CHOICES as b}<label><input type="radio" class="peer sr-only" name="bt" value={b} checked={bloodType === b} onchange={() => (bloodType = b)} /><span class="seg-box">{b}</span></label>{/each}
						</div>
						{#if errors.bloodType}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.bloodType}</span>{/if}
					{/if}
					<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>The donor becomes Verified when a blood type is entered, now or from the <a class="link" href="/facility/{id}/lab-results">lab results list</a>.</p></div>
				{:else if tab === 'deferred'}
					<h2 class="text-xl font-bold">Deferred today</h2>
					<p class="text-[15px] leading-[22px] text-muted">Only the fact is recorded. We never store a health reason.</p>
					<div class="flex flex-col gap-2">
						<label for="pause" class="field-label">Pause alerts until <span class="font-normal text-muted">(optional)</span></label>
						<input id="pause" type="date" min={todayNairobi()} bind:value={pauseUntil} class="field-input {errors.returnAfter ? 'is-error' : ''}" />
						{#if errors.returnAfter}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.returnAfter}</span>{:else}<span class="field-help">The donor gets no urgent call alerts until this date. Clear it for no pause. No reason is stored or shown.</span>{/if}
					</div>
				{:else}
					<h2 class="text-xl font-bold">Did not attend</h2>
					<p class="text-[15px] leading-[22px] text-muted">Marks the booked visit as missed. There is no penalty, and the donor can book again any time.</p>
				{/if}

				{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
				<button class="btn-primary" disabled={busy || (tab === 'test' && testType === 'now' && !bloodType)}>{busy ? 'Saving…' : tab === 'donated' ? 'Record donation' : tab === 'test' ? 'Record test' : tab === 'deferred' ? 'Record deferral' : 'Mark as did not attend'}</button>
			</form>
		{/if}
	{:else}
		<header class="flex flex-col gap-1.5">
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Check in a donor</h1>
			<p class="text-base leading-6 text-muted">Enter the donor code they show you.</p>
		</header>

		<form class="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end" onsubmit={find}>
			<div class="flex flex-1 flex-col gap-2">
				<label for="code" class="field-label">Donor code</label>
				<input id="code" type="text" bind:value={code} placeholder={`${BRAND.codePrefix}-XXXX-XX`} autocapitalize="characters" autocomplete="off" class="field-input text-xl tracking-wider" />
			</div>
			<button class="btn-primary sm:!w-auto sm:px-8" disabled={busy || !code.trim()}>{busy ? 'Looking…' : 'Find donor'}</button>
		</form>

		{#if notFound}<p class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />No donor with that code. Check the characters, or add them as a walk-in.</p>{/if}
		{#if error}<p class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />{error}</p>{/if}

		{#if card}
			<section class="card overflow-hidden">
				<div class="flex flex-col gap-4 p-6 md:flex-row md:items-center md:p-8">
					{#if card.bloodType}
						<span class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-[34px] font-extrabold leading-none text-white">{card.bloodType}</span>
					{:else}
						<span class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-dashed border-rose-300 text-center text-sm font-bold leading-4 text-red-700">Type not known</span>
					{/if}
					<div class="flex flex-col gap-1.5">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-[26px] font-extrabold leading-8 tracking-tight">{card.name}</h2>
							<span class="badge {card.verified ? 'badge-ok' : 'badge-neutral'}">{#if card.verified}<Icon name="shield" class="h-4 w-4" />{/if}{card.verified ? 'Verified' : 'Registered, not verified'}</span>
						</div>
						<p class="text-[15px] text-muted">{card.sex === 'female' ? 'Female' : 'Male'} · {card.age} years · {card.code}</p>
						{#if card.appointment}<p class="badge badge-soft self-start">Booked visit: {card.appointment.kind === 'donate' ? 'donation' : 'test'}</p>{/if}
					</div>
				</div>
				<dl class="grid gap-px border-t border-rose-200 bg-rose-200 sm:grid-cols-3">
					<div class="bg-white px-6 py-4"><dt class="text-[13px] text-muted">Weight</dt><dd class="text-lg font-bold">{card.weightKg != null ? `${card.weightKg} kg` : 'Not recorded'}</dd></div>
					<div class="bg-white px-6 py-4"><dt class="text-[13px] text-muted">Last donation</dt><dd class="text-lg font-bold">{card.lastDonationOn ? longDate(card.lastDonationOn) : 'None yet'}</dd></div>
					<div class="bg-white px-6 py-4"><dt class="text-[13px] text-muted">Donations recorded</dt><dd class="text-lg font-bold">{card.donations}</dd></div>
				</dl>
				<div class="flex flex-col gap-4 border-t border-rose-200 p-6 md:p-8">
					<div>
						<h3 class="flex items-center gap-2 text-xl font-extrabold {card.eligibility.status === 'eligible' ? 'text-emerald-800' : card.eligibility.status === 'waiting' ? 'text-red-800' : 'text-amber-900'}"><Icon name={card.eligibility.status === 'eligible' ? 'check' : 'alert'} class="h-6 w-6" />{card.eligibility.status === 'eligible' ? 'Likely eligible today' : card.eligibility.status === 'waiting' ? `Not eligible until ${when}` : 'Not eligible to donate'}</h3>
						<p class="mt-1 text-[13px] text-muted">A guide only. Your own screening today has the final say.</p>
					</div>
					<ul class="flex flex-col gap-3">
						{#each card.checks as c}
							<li class="flex items-center gap-3">
								<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {c.ok ? 'bg-emerald-100 text-emerald-800' : c.advisory ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}"><Icon name={c.ok ? 'check' : 'alert'} class="h-4 w-4" /></span>
								<span class="leading-5"><span class="block font-semibold">{c.key === 'age' ? 'Age' : c.key === 'weight' ? 'Weight' : 'Waiting period'}</span><span class="block text-[13px] text-muted">{c.text}</span></span>
							</li>
						{/each}
					</ul>
				</div>
				<div class="flex flex-col gap-3 border-t border-rose-200 bg-rose-50 p-6 sm:flex-row md:px-8">
					<button type="button" class="btn-primary sm:!w-auto sm:px-8" onclick={() => (step = 'outcome')}>Record outcome</button>
					<a class="btn-secondary sm:!w-auto sm:px-6" href="/facility/{id}/records/{encodeURIComponent(card.code)}">Correct details</a>
					<button type="button" class="link flex h-[52px] items-center px-3 text-[15px]" onclick={reset}>Next donor</button>
				</div>
			</section>
		{:else}
			<div class="card flex flex-col items-center gap-3 p-8 text-center">
				<span class="path-icon h-14 w-14"><Icon name="check" class="h-7 w-7" /></span>
				<p class="text-muted">No code on hand? <a class="link" href="/facility/{id}/walkin">Add a walk-in</a> instead.</p>
			</div>
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
	{/if}
</FacilityShell>
