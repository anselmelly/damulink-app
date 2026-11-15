<script lang="ts">
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { COUNTIES } from '$lib/counties'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PasswordInput from '$lib/ui/PasswordInput.svelte'
	import TextField from '$lib/ui/TextField.svelte'
	import { FACILITY_TYPES } from '@damu/shared-types'

	let step = $state<1 | 2>(1)
	let name = $state('')
	let email = $state('')
	let phone = $state('')
	let password = $state('')
	let facilityName = $state('')
	let facilityType = $state('hospital')
	let county = $state('')
	let town = $state('')
	let errors = $state<Record<string, string>>({})
	let error = $state('')
	let busy = $state(false)

	const phoneForApi = $derived('254' + phone.replace(/\D/g, '').replace(/^0/, ''))
	const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

	function next(e: SubmitEvent) {
		e.preventDefault()
		errors = {}
		if (name.trim().length < 2) errors.name = 'Enter your name'
		if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = 'Enter a valid email'
		if (!/^254[17]\d{8}$/.test(phoneForApi)) errors.phone = 'Enter a valid Kenyan phone number'
		if (password.length < 8) errors.password = 'Use at least 8 characters'
		if (Object.keys(errors).length) return
		step = 2
		scrollTo(0, 0)
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		errors = {}
		error = ''
		if (facilityName.trim().length < 2) errors.facilityName = 'Enter the facility name'
		if (!county) errors.county = 'Choose a county'
		if (town.trim().length < 2) errors.town = 'Enter the town'
		if (Object.keys(errors).length) return
		busy = true
		try {
			await auth.registerFacility({ name: name.trim(), email: email.trim(), phone: phoneForApi, password, facilityName: facilityName.trim(), facilityType, county, town: town.trim() })
			await goto('/verify-phone')
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) {
				errors = err.fields
				if (['name', 'email', 'phone', 'password'].some((k) => err.fields[k])) step = 1
			} else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	const stepClass = (n: 1 | 2) => (n <= step ? 'border-rose-600' : 'border-rose-200')
	const numClass = (n: 1 | 2) => (n === step ? 'bg-rose-600 text-white' : n < step ? 'bg-rose-100 text-red-700' : 'border-[1.5px] border-rose-200 text-muted')
</script>

<svelte:head><title>Register your facility | {BRAND.name}</title></svelte:head>

<AuthShell
	brandTitle={`Bring your facility onto ${BRAND.name}.`}
	brandText={`Register your facility, health centre, or blood bank. A ${BRAND.name} reviewer checks it by hand before it can post calls or alert donors.`}
	brandPoints={['Only verified facilities can publish calls', 'You are the facility admin and add your own team', 'Donors join by choice, you never register them']}
	inner="max-w-[560px]"
>
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-[32px] font-extrabold leading-[38px] tracking-tight">Register your facility</h1>
			<p class="text-base leading-6 text-muted">For the person who will run {BRAND.name} at the facility. Just the basics now. You complete the rest of the profile after you verify your email.</p>
		</div>

		<nav aria-label="Sign up steps" class="grid grid-cols-2 gap-3">
			{#each [[1, 'Your account'], [2, 'Facility details']] as [n, l]}
				<div class="flex items-center gap-3 border-b-[3px] pb-3 {stepClass(n as 1 | 2)}" aria-current={n === step ? 'step' : undefined}>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold {numClass(n as 1 | 2)}">{#if (n as number) < step}<Icon name="check" class="h-5 w-5" />{:else}0{n}{/if}</span>
					<span class="flex flex-col leading-5"><span class="text-[13px] text-muted">Step {n}</span><span class="text-[15px] font-bold">{l}</span></span>
				</div>
			{/each}
		</nav>

		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		{#if step === 1}
			<form onsubmit={next} class="flex flex-col gap-6">
				<fieldset class="flex min-w-0 flex-col gap-5 border-0 p-0">
					<legend class="eyebrow mb-4 p-0">About you</legend>
					<TextField id="full-name" label="Your full name" autocomplete="name" placeholder="Amina Wanjiru" bind:value={name} error={errors.name} />
					<TextField id="work-email" label="Your work email" type="email" autocomplete="email" placeholder="you@riftcounty.example" bind:value={email} error={errors.email} help="Use your own address at the facility, not a shared inbox, so actions can be traced to you. We email a link to verify it." />
					<div class="flex flex-col gap-2">
						<label for="signup-phone" class="field-label">Your phone number</label>
						<div class="flex gap-2"><span class="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-xl border-[1.5px] border-rose-200 bg-rose-50 text-base font-semibold">+254</span><input id="signup-phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="712 345 678" bind:value={phone} class="field-input min-w-0 flex-1 {errors.phone ? 'is-error' : ''}" /></div>
						{#if errors.phone}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.phone}</span>{:else}<span class="field-help">We text a code to confirm it is you. The reviewer may call this number.</span>{/if}
					</div>
					<PasswordInput id="signup-password" label="Password" autocomplete="new-password" placeholder="Create a password" bind:value={password} error={errors.password} help="At least 8 characters." />
				</fieldset>
				<button type="submit" class="btn-primary">Continue<Icon name="arrow" class="h-5 w-5" /></button>
				<p class="text-center text-[15px] leading-[22px] text-muted">Already have an account? <a href="/login" class="link font-bold">Log in</a></p>
			</form>
		{:else}
			<form onsubmit={submit} class="flex flex-col gap-6">
				<fieldset class="flex min-w-0 flex-col gap-5 border-0 p-0">
					<legend class="eyebrow mb-4 p-0">The facility</legend>
					<TextField id="fname" label="Facility name" placeholder="Rift County Hospital" bind:value={facilityName} error={errors.facilityName} />
					<div class="flex flex-col gap-2"><label for="ftype" class="field-label">Type</label><select id="ftype" bind:value={facilityType} class="field-input {errors.facilityType ? 'is-error' : ''}">{#each FACILITY_TYPES as t}<option value={t}>{label(t)}</option>{/each}</select></div>
					<div class="grid gap-5 sm:grid-cols-2">
						<div class="flex flex-col gap-2"><label for="county" class="field-label">County</label><select id="county" bind:value={county} class="field-input {errors.county ? 'is-error' : ''}"><option value="">Choose a county</option>{#each COUNTIES as c}<option>{c}</option>{/each}</select>{#if errors.county}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.county}</span>{/if}</div>
						<TextField id="town" label="Town" placeholder="Nakuru" bind:value={town} error={errors.town} />
					</div>
					<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>After you verify your email and phone you will add the license number, GPS pin and contact details. The review starts then.</p></div>
				</fieldset>
				<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
					<button type="button" onclick={() => (step = 1)} class="btn-secondary sm:px-6"><Icon name="chev-l" class="h-5 w-5" />Back</button>
					<button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
				</div>
			</form>
		{/if}
	</div>
</AuthShell>
