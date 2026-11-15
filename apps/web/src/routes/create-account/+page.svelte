<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError, apiFetch } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AuthShell from '$lib/ui/AuthShell.svelte'
	import DobInput from '$lib/ui/DobInput.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PasswordInput from '$lib/ui/PasswordInput.svelte'
	import TextField from '$lib/ui/TextField.svelte'

	type Facility = { id: string; name: string; town: string }

	let step = $state<1 | 2>(1)
	let name = $state('')
	let email = $state('')
	let phone = $state('')
	let password = $state('')
	let sex = $state<'female' | 'male' | ''>('')
	let dob = $state('')
	let dobTouched = $state(false)
	let homeFacilityId = $state('')
	let extraFacilityId = $state('')
	let showExtra = $state(false)
	let missingFacility = $state('')
	let smsOptIn = $state(true)
	let agree = $state(false)
	let facilities = $state<Facility[]>([])
	let errors = $state<Record<string, string>>({})
	let formError = $state('')
	let busy = $state(false)

	onMount(async () => {
		try {
			facilities = await apiFetch<Facility[]>('/facilities')
			// arriving from a facility's invite link: that facility is already the home facility
			const wanted = page.url.searchParams.get('facility')
			if (wanted && facilities.some((f) => f.id === wanted)) homeFacilityId = wanted
		} catch {
			/* the list is optional: "My facility is not listed" still works */
		}
	})

	const under18 = $derived.by(() => {
		if (!dob) return false
		const d = new Date(dob + 'T00:00:00Z')
		const t = new Date()
		const cutoff = new Date(Date.UTC(t.getUTCFullYear() - 18, t.getUTCMonth(), t.getUTCDate()))
		return !Number.isNaN(d.getTime()) && d > cutoff
	})

	/** "712 345 678" or "0712 345 678" -> what the API normalises. */
	const phoneForApi = $derived('254' + phone.replace(/\D/g, '').replace(/^0/, ''))

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
		formError = ''
		if (!sex) errors.sex = 'Choose one'
		if (!dob) errors.dateOfBirth = dobTouched ? 'Enter a real date, like 14 March 1995' : 'Enter your date of birth'
		if (!agree) errors.agree = 'You need to agree to continue'
		if (Object.keys(errors).length) return
		busy = true
		try {
			await auth.signup({
				name: name.trim(),
				email: email.trim(),
				phone: phoneForApi,
				password,
				sex: sex as 'female' | 'male',
				dateOfBirth: dob,
				homeFacilityId: homeFacilityId || undefined,
				unlistedFacilityName: missingFacility.trim() || undefined,
				extraFacilityIds: showExtra && extraFacilityId ? [extraFacilityId] : [],
				smsOptIn,
			})
			await goto('/verify-phone')
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) {
				errors = err.fields
				if (['name', 'email', 'phone', 'password'].some((k) => err.fields[k])) step = 1
			} else formError = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}

	const stepClass = (n: 1 | 2) => (n <= step ? 'border-rose-600' : 'border-rose-200')
	const numClass = (n: 1 | 2) => (n === step ? 'bg-rose-600 text-white' : n < step ? 'bg-rose-100 text-red-700' : 'border-[1.5px] border-rose-200 text-muted')
	// already signed in: there is nothing to do here
	onMount(async () => {
		await auth.init()
		if (auth.user) await goto('/dashboard', { replaceState: true })
	})
</script>

<svelte:head><title>Create account | {BRAND.name}</title></svelte:head>

<AuthShell
	brandTitle="One account. Give, ask, or run a facility."
	brandText="Join as a donor so medical facilities can reach you, request blood for someone you know, or add your facility for verification."
	brandPoints={['Your phone number is never shown publicly', 'You choose when to get alerts, and can stop any time', 'Medical facilities confirm your blood type, never you alone']}
	inner="max-w-[520px]"
>
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-[32px] font-extrabold leading-[38px] tracking-tight">Create your account</h1>
			<p class="text-base leading-6 text-muted">It takes about two minutes. You will verify your phone and email next.</p>
		</div>

		<nav aria-label="Sign up steps" class="grid grid-cols-2 gap-3">
			{#each [[1, 'Your account'], [2, 'Donor details']] as [n, label]}
				<div class="flex items-center gap-3 border-b-[3px] pb-3 {stepClass(n as 1 | 2)}" aria-current={n === step ? 'step' : undefined}>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold {numClass(n as 1 | 2)}">{#if (n as number) < step}<Icon name="check" class="h-5 w-5" />{:else}0{n}{/if}</span>
					<span class="flex flex-col leading-5"><span class="text-[13px] text-muted">Step {n}</span><span class="text-[15px] font-bold">{label}</span></span>
				</div>
			{/each}
		</nav>

		{#if formError}
			<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{formError}</p></div>
		{/if}

		{#if step === 1}
			<form onsubmit={next} class="flex flex-col gap-6">
				<fieldset class="flex min-w-0 flex-col gap-5 border-0 p-0">
					<legend class="eyebrow mb-4 p-0">About you</legend>
					<TextField id="full-name" label="Full name" autocomplete="name" placeholder="Amina Wanjiru" bind:value={name} error={errors.name} />
					<div class="grid gap-5 sm:grid-cols-2">
						<TextField id="signup-email" label="Email" type="email" autocomplete="email" placeholder="you@example.com" bind:value={email} error={errors.email} />
						<div class="flex flex-col gap-2">
							<label for="signup-phone" class="field-label">Phone number</label>
							<div class="flex gap-2">
								<span class="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-xl border-[1.5px] border-rose-200 bg-rose-50 text-base font-semibold">+254</span>
								<input id="signup-phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="712 345 678" bind:value={phone} class="field-input min-w-0 flex-1 {errors.phone ? 'is-error' : ''}" />
							</div>
							{#if errors.phone}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.phone}</span>{/if}
						</div>
					</div>
					<span class="field-help -mt-2.5">We text a code to your phone and email a link. The phone code is required.</span>
					<PasswordInput id="signup-password" label="Password" autocomplete="new-password" placeholder="Create a password" bind:value={password} error={errors.password} help="At least 8 characters." />
				</fieldset>
				<button type="submit" class="btn-primary">Continue<Icon name="arrow" class="h-5 w-5" /></button>
				<p class="text-center text-[15px] leading-[22px] text-muted">Already have an account? <a href="/login" class="link font-bold">Log in</a></p>
			</form>
		{:else}
			<form onsubmit={submit} class="flex flex-col gap-6">
				<fieldset class="flex min-w-0 flex-col gap-5 border-0 p-0">
					<legend class="eyebrow mb-1 p-0">Donor details</legend>
					<p class="-mt-1 text-[15px] leading-[22px] text-muted">Medical facilities use these to match you to calls. Blood type, weight, and last donation are recorded by a medical facility, not by you.</p>

					<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0">
						<legend class="field-label mb-2 p-0">Sex</legend>
						<div class="grid grid-cols-2 gap-2">
							<label><input type="radio" name="sex" value="female" bind:group={sex} class="peer sr-only" /><span class="seg-box">Female</span></label>
							<label><input type="radio" name="sex" value="male" bind:group={sex} class="peer sr-only" /><span class="seg-box">Male</span></label>
						</div>
						{#if errors.sex}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.sex}</span>{:else}<span class="field-help">Sets the waiting time between donations.</span>{/if}
					</fieldset>

					<DobInput bind:value={dob} bind:touched={dobTouched} error={errors.dateOfBirth} />

					<div class="flex flex-col gap-2">
						<label for="home-facility" class="field-label">Home facility</label>
						<select id="home-facility" bind:value={homeFacilityId} class="field-input {errors.homeFacilityId ? 'is-error' : ''}">
							<option value="">Choose the facility you would donate at</option>
							{#each facilities as f}<option value={f.id}>{f.name}, {f.town}</option>{/each}
						</select>
						{#if errors.homeFacilityId}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.homeFacilityId}</span>{:else}<span class="field-help">Alerts start from your home facility and widen outward.</span>{/if}
					</div>

					{#if showExtra}
						<div class="flex flex-col gap-2">
							<label for="extra-facility" class="field-label">Another facility <span class="font-normal text-muted">(optional)</span></label>
							<select id="extra-facility" bind:value={extraFacilityId} class="field-input">
								<option value="">Choose a second facility</option>
								{#each facilities.filter((f) => f.id !== homeFacilityId) as f}<option value={f.id}>{f.name}, {f.town}</option>{/each}
							</select>
						</div>
					{:else}
						<button type="button" onclick={() => (showExtra = true)} class="link -mt-1 inline-flex h-11 items-center gap-1.5 self-start text-[15px]"><Icon name="plus" class="h-5 w-5" />Add another facility</button>
					{/if}

					<details class="group rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
						<summary class="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-red-700">My facility is not listed<Icon name="chev-d" class="h-5 w-5 transition group-open:rotate-180" /></summary>
						<div class="flex flex-col gap-2 pb-2 pt-2">
							<label for="missing-facility" class="field-label">Facility name and town</label>
							<input id="missing-facility" type="text" placeholder="For example, Riverside Dispensary, Thika" bind:value={missingFacility} class="field-input" />
							<span class="field-help">We record it so we can invite that facility. You can still sign up now and add a home facility later.</span>
						</div>
					</details>

					{#if under18}
						<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Under 18? You cannot become a donor yet, but you can still request blood for someone.</p></div>
					{/if}
				</fieldset>

				<hr class="border-rose-100" />

				<fieldset class="flex min-w-0 flex-col gap-4 border-0 p-0">
					<legend class="sr-only">Agreements</legend>
					<label for="sms-optin" class="flex items-start gap-3 text-sm leading-[21px]">
						<input id="sms-optin" type="checkbox" bind:checked={smsOptIn} class="mt-px h-6 w-6 shrink-0 accent-rose-600" />
						<span><strong class="font-bold">Send me SMS alerts</strong> when my blood type is needed near me. Reply STOP to a message at any time to pause them.</span>
					</label>
					<div>
						<label for="agree" class="flex items-start gap-3 text-sm leading-[21px]">
							<input id="agree" type="checkbox" bind:checked={agree} class="mt-px h-6 w-6 shrink-0 accent-rose-600" />
							<span>I agree to the Terms and the Privacy Notice.</span>
						</label>
						{#if errors.agree}<span class="field-error mt-2"><Icon name="alert" class="h-4 w-4" />{errors.agree}</span>{/if}
					</div>
				</fieldset>

				<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
					<button type="button" onclick={() => (step = 1)} class="btn-secondary sm:px-6"><Icon name="chev-l" class="h-5 w-5" />Back</button>
					<button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
				</div>
			</form>
		{/if}
	</div>
</AuthShell>
