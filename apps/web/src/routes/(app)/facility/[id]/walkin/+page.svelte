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
	const driveId = page.url.searchParams.get('drive') ?? undefined
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
			done = await auth.call(`/my-facilities/${id}/walkins`, { body: { name, sex: sex || undefined, dateOfBirth: dob, weightKg: weight.trim() ? Number(weight) : undefined, bloodType: bloodType || undefined, outcome, invitePhone: invite && phone.trim() ? phone : undefined, driveId } })
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

<FacilityShell {f} width="narrow" active="checkin">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Add a walk-in</h1>
		<p class="text-base leading-6 text-muted">For someone donating today without a {BRAND.name} account. Quick and minimal.</p>
	</header>
	{#if done}
		<section class="card flex flex-col items-center gap-4 p-8 text-center md:p-12" role="status">
			<span class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white"><Icon name="check" class="h-8 w-8" /></span>
			<h2 class="text-[26px] font-extrabold leading-8 tracking-tight">{outcome === 'donated' ? 'Donation recorded' : outcome === 'test' ? 'Test recorded' : 'Deferral recorded'}</h2>
			<p class="max-w-md text-base leading-6 text-muted">No account was created, so no contact details are kept.{done.inviteSent ? ' An invitation was texted.' : ' Offer to register them so medical facilities can reach them when their blood type is needed.'}</p>
			{#if done.warning}<p class="badge badge-warn">Weight is under 50 kg. The facility decides.</p>{/if}
			<div class="mt-2 flex w-full max-w-sm flex-col gap-3"><button type="button" class="btn-primary" onclick={again}>Add another walk-in</button><a class="btn-secondary" href={driveId ? `/facility/${id}/drives/${driveId}` : `/facility/${id}/checkin`}>Done</a></div>
		</section>
	{:else}
		<form class="card flex flex-col gap-5 p-6 md:p-8" onsubmit={submit}>
			<TextField id="name" label="Full name" bind:value={name} error={errors.name ?? ''} />
			<div class="grid gap-5 sm:grid-cols-2">
				<fieldset class="flex flex-col gap-2"><legend class="field-label mb-2">Sex</legend>
					<div class="grid grid-cols-2 gap-2">{#each [['female', 'Female'], ['male', 'Male']] as [k, l]}<label><input type="radio" class="peer sr-only" name="sex" value={k} checked={sex === k} onchange={() => (sex = k as typeof sex)} /><span class="seg-box text-center">{l}</span></label>{/each}</div>
					{#if errors.sex}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.sex}</span>{/if}
				</fieldset>
				<div class="flex flex-col gap-2">
					<label for="dob" class="field-label">Date of birth</label>
					<input id="dob" type="date" bind:value={dob} class="field-input {errors.dateOfBirth ? 'is-error' : ''}" />
					{#if errors.dateOfBirth}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.dateOfBirth}</span>{:else}<span class="field-help">18 to 65 can donate.</span>{/if}
				</div>
			</div>
			<div class="grid gap-5 sm:grid-cols-2">
				<TextField id="weight" label="Weight today (kg), optional" bind:value={weight} inputmode="numeric" error={errors.weightKg ?? ''} help="Under 50 kg shows a warning; the facility decides." />
				<div class="flex flex-col gap-2">
					<label for="bt" class="field-label">Blood type <span class="font-normal text-muted">(if tested today)</span></label>
					<select id="bt" bind:value={bloodType} class="field-input"><option value="">Not known yet</option>{#each BLOOD_CHOICES as b}<option value={b}>{b}</option>{/each}</select>
				</div>
			</div>
			<div class="flex flex-col gap-2">
				<label for="outcome" class="field-label">Outcome</label>
				<select id="outcome" bind:value={outcome} class="field-input"><option value="donated">Donated</option><option value="test">Test only</option><option value="deferred">Deferred</option></select>
			</div>
			<label class="notice cursor-pointer"><input type="checkbox" bind:checked={invite} class="mt-0.5 h-6 w-6 shrink-0" /><span class="flex flex-col"><span class="font-semibold">They want a {BRAND.name} account</span><span class="text-muted">Only if they say yes. Otherwise nothing but the details above is kept.</span></span></label>
			{#if invite}<TextField id="phone" label="Phone" bind:value={phone} type="tel" inputmode="tel" error={errors.invitePhone ?? ''} help="We text a link to set up the account. The number is deleted right after." />{/if}
			{#if error}<p class="field-error" role="alert"><Icon name="alert" class="h-4 w-4" />{error}</p>{/if}
			<div class="flex gap-3"><a class="btn-secondary sm:!w-auto sm:px-8" href={driveId ? `/facility/${id}/drives/${driveId}` : `/facility/${id}/checkin`}>Cancel</a><button class="btn-primary flex-1" disabled={busy || !name.trim() || !sex || !dob}>{busy ? 'Saving…' : 'Record walk-in'}</button></div>
		</form>
	{/if}
</FacilityShell>
