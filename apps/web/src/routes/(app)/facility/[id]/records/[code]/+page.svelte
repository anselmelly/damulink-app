<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import { BLOOD_CHOICES } from '$lib/requests'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import TextField from '$lib/ui/TextField.svelte'
	import { CORRECTION_REASONS, type MyFacilityView, type RecordView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	const code = $derived(page.params.code ?? '')
	let f = $state<MyFacilityView | null>(null)
	let v = $state<RecordView | null>(null)
	let missing = $state(false)
	let bloodType = $state('')
	let weight = $state('')
	let date = $state('')
	let reason = $state('')
	let note = $state('')
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	let saved = $state(false)
	const base = $derived(`/my-facilities/${id}/records/${encodeURIComponent(code)}`)
	async function load() {
		v = await auth.call<RecordView>(base)
		bloodType = v.bloodType ?? ''
		weight = v.weightKg != null ? String(v.weightKg) : ''
		date = v.lastDonationOn ?? ''
	}
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {
			missing = true
		}
	})
	async function submit(e: SubmitEvent) {
		e.preventDefault()
		if (!v) return
		busy = true
		error = ''
		errors = {}
		saved = false
		const body: Record<string, unknown> = { reason: reason || undefined, note: note || undefined }
		if (v.own.bloodType && bloodType && bloodType !== v.bloodType) body.bloodType = bloodType
		if (weight.trim() && Number(weight) !== v.weightKg) body.weightKg = Number(weight)
		if (v.own.donation && date && date !== v.lastDonationOn) body.lastDonationOn = date
		try {
			await auth.call(`${base}/correct`, { body })
			saved = true
			reason = note = ''
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
	const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' })
	const FIELD = { blood_type: 'Blood type', weight: 'Weight', last_donation: 'Last donation' } as const
</script>

<svelte:head><title>Correct a record | {BRAND.name}</title></svelte:head>

<FacilityShell {f} width="narrow" active="checkin">
	<a href="/facility/{id}/checkin" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Check-in</a>
	<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Correct a record</h1>
	{#if missing}
		<div class="card p-8 text-center text-muted">No record of this donor at this facility.</div>
	{:else if v}
		<div class="card flex items-center gap-4 p-4">
			<span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-xl font-extrabold text-white">{v.bloodType ?? '?'}</span>
			<span class="leading-5"><span class="block text-lg font-bold">{v.name}</span><span class="block text-[13px] text-muted">{v.code}</span></span>
		</div>
		{#if saved}<p class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-emerald-700" />Correction saved and logged. The donor was not messaged.</p>{/if}
		{#if v.locked}
			<div class="card flex flex-col gap-2 p-6"><p class="font-bold">This record is older than a day</p><p class="text-muted">Only a facility admin can change an older record. Ask an admin to make the correction.</p><a class="link" href="/facility/{id}/checkin">Back</a></div>
		{:else}
			{#if f?.role === 'admin'}<div class="notice"><Icon name="shield" class="mt-px h-[22px] w-[22px] text-red-700" /><p>You are an admin, so you can change older records too. A reason is required and the change is logged.</p></div>{/if}
			<form class="card flex flex-col gap-5 p-6 md:p-8" onsubmit={submit}>
				<div class="grid gap-5 sm:grid-cols-2">
					<div class="flex flex-col gap-2">
						<label for="bt" class="field-label">Blood type</label>
						<select id="bt" bind:value={bloodType} disabled={!v.own.bloodType} class="field-input"><option value="">{v.bloodType ?? 'Not recorded'}</option>{#each BLOOD_CHOICES as b}<option value={b}>{b}</option>{/each}</select>
						<span class="field-help">{v.own.bloodType ? `Currently ${v.bloodType ?? 'not recorded'}. Usually corrected after the lab result.` : 'Verified by another facility, so it cannot be changed here.'}</span>
					</div>
					<TextField id="weight" label="Weight (kg)" bind:value={weight} inputmode="numeric" error={errors.weightKg ?? ''} />
				</div>
				<div class="flex flex-col gap-2">
					<label for="date" class="field-label">Last donation date</label>
					<input id="date" type="date" bind:value={date} disabled={!v.own.donation} class="field-input {errors.lastDonationOn ? 'is-error' : ''}" />
					{#if errors.lastDonationOn}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.lastDonationOn}</span>{:else}<span class="field-help">Changing it changes when the donor is next eligible.</span>{/if}
				</div>
				<hr class="border-rose-100" />
				<div class="flex flex-col gap-2">
					<label for="reason" class="field-label">Reason for the correction</label>
					<select id="reason" bind:value={reason} class="field-input {errors.reason ? 'is-error' : ''}"><option value="">Choose one</option>{#each Object.entries(CORRECTION_REASONS) as [k, l]}<option value={k}>{l}</option>{/each}</select>
					{#if errors.reason}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.reason}</span>{/if}
				</div>
				<div class="flex flex-col gap-2"><label for="note" class="field-label">Note <span class="font-normal text-muted">(optional)</span></label><textarea id="note" bind:value={note} rows="3" maxlength="200" class="field-input !h-auto py-3"></textarea></div>
				{#if errors.bloodType}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{errors.bloodType}</p>{/if}
				{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
				<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Every correction is logged with who made it, when, the old and new values, and the reason.</p></div>
				<div class="flex gap-3"><a class="btn-secondary sm:!w-auto sm:px-8" href="/facility/{id}/checkin">Cancel</a><button class="btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : 'Save correction'}</button></div>
			</form>
		{/if}
		<section class="card flex flex-col gap-3 p-6" aria-labelledby="log-h">
			<h2 id="log-h" class="text-lg font-extrabold">Earlier changes to this record</h2>
			{#if !v.log.length}<p class="text-muted">No corrections yet.</p>{:else}
				<ul class="flex flex-col gap-3">{#each v.log as l (l.id)}<li class="flex items-start gap-3"><span class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600"></span><span class="leading-6"><span class="font-semibold">{FIELD[l.field]} {l.oldValue ? `${l.field === 'last_donation' ? longDate(l.oldValue) : l.oldValue} to ${l.field === 'last_donation' ? longDate(l.newValue) : l.newValue}` : `set to ${l.newValue}`}</span> <span class="text-[14px] text-muted">by {l.by} · {when(l.at)} · {CORRECTION_REASONS[l.reason].toLowerCase()}{l.note ? ` · ${l.note}` : ''}</span></span></li>{/each}</ul>
			{/if}
		</section>
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
