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

<FacilityShell {f} active="checkin">
	<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">Correct a record</h1>
	{#if missing}
		<div class="card p-8 text-center text-muted">No record of this donor at this facility.</div>
	{:else if v}
		<p class="text-muted">{v.name} · {v.code}</p>
		{#if saved}<p class="card flex items-center gap-2 p-4 font-semibold text-emerald-800" role="status"><Icon name="check" class="h-5 w-5" />Correction saved and logged. The donor was not messaged.</p>{/if}
		{#if v.locked}
			<div class="card flex flex-col gap-2 p-6"><p class="font-bold">This record is older than a day</p><p class="text-muted">Only a facility admin can change an older record. Ask an admin to make the correction.</p><a class="link" href="/facility/{id}/checkin">Back</a></div>
		{:else}
			<form class="card flex flex-col gap-5 p-6" onsubmit={submit}>
				<fieldset class="flex flex-col gap-2" disabled={!v.own.bloodType}><legend class="field-label">Blood type</legend>
					<div class="flex flex-wrap gap-2">{#each BLOOD_CHOICES as b}<label><input type="radio" class="peer sr-only" name="bt" value={b} checked={bloodType === b} onchange={() => (bloodType = b)} /><span class="seg-box">{b}</span></label>{/each}</div>
					<span class="field-help">{v.own.bloodType ? `Currently ${v.bloodType ?? 'not recorded'}. Usually corrected after the lab result.` : 'Verified by another facility, so it cannot be changed here.'}</span>
				</fieldset>
				<TextField id="weight" label="Weight (kg)" bind:value={weight} inputmode="numeric" error={errors.weightKg ?? ''} />
				<div class="flex flex-col gap-2">
					<label for="date" class="field-label">Last donation date</label>
					<input id="date" type="date" bind:value={date} disabled={!v.own.donation} class="field-input {errors.lastDonationOn ? 'is-error' : ''}" />
					{#if errors.lastDonationOn}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.lastDonationOn}</span>{:else}<span class="field-help">Changing it changes when the donor is next eligible.</span>{/if}
				</div>
				<div class="flex flex-col gap-2">
					<label for="reason" class="field-label">Reason for the correction</label>
					<select id="reason" bind:value={reason} class="field-input {errors.reason ? 'is-error' : ''}"><option value="">Choose one</option>{#each Object.entries(CORRECTION_REASONS) as [k, l]}<option value={k}>{l}</option>{/each}</select>
					{#if errors.reason}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.reason}</span>{/if}
				</div>
				<TextField id="note" label="Note (optional)" bind:value={note} help="Every correction is logged with who made it, when, the old and new values, and the reason." />
				{#if errors.bloodType}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{errors.bloodType}</p>{/if}
				{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
				<div class="flex gap-3"><button class="btn-primary w-auto px-8" disabled={busy}>{busy ? 'Saving…' : 'Save correction'}</button><a class="btn-secondary w-auto px-8" href="/facility/{id}/checkin">Cancel</a></div>
			</form>
		{/if}
		<section class="flex flex-col gap-3" aria-labelledby="log-h">
			<h2 id="log-h" class="text-lg font-extrabold">Earlier changes to this record</h2>
			{#if !v.log.length}<p class="card p-5 text-muted">No corrections yet.</p>{:else}
				<ul class="card divide-y divide-rose-100">{#each v.log as l (l.id)}<li class="p-4"><span class="font-semibold">{FIELD[l.field]} {l.oldValue ? `${l.field === 'last_donation' ? longDate(l.oldValue) : l.oldValue} to ${l.field === 'last_donation' ? longDate(l.newValue) : l.newValue}` : `set to ${l.newValue}`}</span><span class="block text-[13px] text-muted">by {l.by} · {when(l.at)} · {CORRECTION_REASONS[l.reason].toLowerCase()}{l.note ? ` · ${l.note}` : ''}</span></li>{/each}</ul>
			{/if}
		</section>
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
