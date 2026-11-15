<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { BLOOD_CHOICES } from '$lib/requests'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import TextField from '$lib/ui/TextField.svelte'
	import type { MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let name = $state('')
	let sex = $state<'female' | 'male' | ''>('')
	let dob = $state('')
	let weight = $state('')
	let bloodType = $state('')
	let outcome = $state<'donated' | 'test' | 'deferred'>('donated')
	let invite = $state(false)
	let phone = $state('')
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	let done = $state<{ inviteSent: boolean; warning?: string } | null>(null)
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
		} catch {}
	})
	const again = () => {
		name = dob = weight = bloodType = phone = ''
		sex = ''
		outcome = 'donated'
		invite = false
		done = null
	}
	async function submit(e: SubmitEvent) {
		e.preventDefault()
		busy = true
		error = ''
		errors = {}
		try {
			done = await auth.call(`/my-facilities/${id}/walkins`, { body: { name, sex: sex || undefined, dateOfBirth: dob, weightKg: weight.trim() ? Number(weight) : undefined, bloodType: bloodType || undefined, outcome, invitePhone: invite && phone.trim() ? phone : undefined } })
		} catch (err) {
			if (err instanceof ApiError) {
				errors = err.fields
				error = Object.keys(err.fields).length ? '' : err.message
			} else error = 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Walk-in | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="walkin">
	<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">Add a walk-in</h1>
	<p class="text-muted">For someone donating today without a {BRAND.name} account. Quick and minimal.</p>
	{#if done}
		<div class="card flex flex-col gap-3 p-6" role="status">
			<h2 class="flex items-center gap-2 text-xl font-extrabold"><Icon name="check" class="h-6 w-6 text-emerald-700" />Walk-in recorded</h2>
			<p>No account was created, so no contact details are kept.{done.inviteSent ? ' An invitation was texted.' : ''}</p>
			{#if done.warning}<p class="badge badge-warn self-start">Weight is under 50 kg. The facility decides.</p>{/if}
			<div class="flex gap-3"><button type="button" class="btn-primary w-auto px-8" onclick={again}>Add another walk-in</button><a class="btn-secondary w-auto px-8" href="/facility/{id}/checkin">Done</a></div>
		</div>
	{:else}
		<form class="card flex flex-col gap-5 p-6" onsubmit={submit}>
			<TextField id="name" label="Full name" bind:value={name} error={errors.name ?? ''} />
			<fieldset class="flex flex-col gap-2"><legend class="field-label">Sex</legend>
				<div class="flex gap-2">{#each [['female', 'Female'], ['male', 'Male']] as [k, l]}<label><input type="radio" class="peer sr-only" name="sex" value={k} checked={sex === k} onchange={() => (sex = k as typeof sex)} /><span class="seg-box">{l}</span></label>{/each}</div>
				{#if errors.sex}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.sex}</span>{/if}
			</fieldset>
			<div class="flex flex-col gap-2">
				<label for="dob" class="field-label">Date of birth</label>
				<input id="dob" type="date" bind:value={dob} class="field-input {errors.dateOfBirth ? 'is-error' : ''}" />
				{#if errors.dateOfBirth}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.dateOfBirth}</span>{:else}<span class="field-help">18 to 65 can donate.</span>{/if}
			</div>
			<TextField id="weight" label="Weight today (kg), optional" bind:value={weight} inputmode="numeric" error={errors.weightKg ?? ''} help="Under 50 kg shows a warning; the facility decides." />
			<fieldset class="flex flex-col gap-2"><legend class="field-label">Blood type, if tested today</legend>
				<div class="flex flex-wrap gap-2">{#each BLOOD_CHOICES as b}<label><input type="radio" class="peer sr-only" name="bt" value={b} checked={bloodType === b} onchange={() => (bloodType = bloodType === b ? '' : b)} /><span class="seg-box">{b}</span></label>{/each}</div>
			</fieldset>
			<fieldset class="flex flex-col gap-2"><legend class="field-label">Outcome</legend>
				<div class="flex flex-wrap gap-2">{#each [['donated', 'Donated'], ['test', 'Test only'], ['deferred', 'Deferred']] as [k, l]}<label><input type="radio" class="peer sr-only" name="outcome" value={k} checked={outcome === k} onchange={() => (outcome = k as typeof outcome)} /><span class="seg-box">{l}</span></label>{/each}</div>
			</fieldset>
			<label class="flex items-center gap-3 font-semibold"><input type="checkbox" bind:checked={invite} class="h-5 w-5" />They want a {BRAND.name} account</label>
			{#if invite}<TextField id="phone" label="Phone" bind:value={phone} type="tel" inputmode="tel" error={errors.invitePhone ?? ''} help="We text a link to set up the account. The number is deleted right after. Only if they say yes." />{/if}
			{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
			<div class="flex gap-3"><button class="btn-primary w-auto px-8" disabled={busy || !name.trim() || !sex || !dob}>{busy ? 'Saving…' : 'Record walk-in'}</button><a class="btn-secondary w-auto px-8" href="/facility/{id}/checkin">Cancel</a></div>
		</form>
	{/if}
</FacilityShell>
