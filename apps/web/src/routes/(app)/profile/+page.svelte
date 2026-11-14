<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError, apiFetch } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import DobInput from '$lib/ui/DobInput.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PasswordInput from '$lib/ui/PasswordInput.svelte'
	import TextField from '$lib/ui/TextField.svelte'

	type Facility = { id: string; name: string; town: string }
	const user = $derived(auth.user!)

	// ---- details
	// svelte-ignore state_referenced_locally: the form starts from the current values
	let name = $state(auth.user!.name)
	// svelte-ignore state_referenced_locally
	let email = $state(auth.user!.email)
	// svelte-ignore state_referenced_locally
	let sex = $state<'female' | 'male' | ''>(auth.user!.sex ?? '')
	// svelte-ignore state_referenced_locally
	let dob = $state(auth.user!.dateOfBirth ?? '')
	let dobTouched = $state(false)
	let detailsSaved = $state(false)
	let detailsErrors = $state<Record<string, string>>({})
	let detailsBusy = $state(false)

	// ---- phone
	let changingPhone = $state(false)
	let newPhone = $state('')
	let phoneError = $state('')

	// ---- facilities
	let all = $state<Facility[]>([])
	let home = $state('')
	let extras = $state<string[]>([])
	let addExtra = $state('')
	let facSaved = $state(false)
	let facError = $state('')
	let facBusy = $state(false)

	// ---- password
	let curPw = $state('')
	let newPw = $state('')
	let newPw2 = $state('')
	let pwErrors = $state<Record<string, string>>({})
	let pwSaved = $state(false)
	let pwBusy = $state(false)

	// ---- delete
	let deleting = $state(false)
	let delPw = $state('')
	let delError = $state('')
	let delBusy = $state(false)

	onMount(async () => {
		try {
			all = await apiFetch<Facility[]>('/facilities')
		} catch {
			/* the lists stay empty */
		}
		const f = user.facilities
		home = f[0]?.id ?? ''
		extras = f.slice(1).map((x) => x.id)
	})

	const name_of = (id: string) => all.find((f) => f.id === id)?.name ?? user.facilities.find((f) => f.id === id)?.name ?? 'Facility'
	const choices = $derived(all.filter((f) => f.id !== home && !extras.includes(f.id)))

	async function saveDetails(e: SubmitEvent) {
		e.preventDefault()
		detailsErrors = {}
		detailsSaved = false
		const changes: Record<string, unknown> = {}
		if (name.trim() !== user.name) changes.name = name.trim()
		if (email.trim().toLowerCase() !== user.email) changes.email = email.trim()
		if (sex && sex !== user.sex) changes.sex = sex
		if (dobTouched) {
			if (!dob) return void (detailsErrors = { dateOfBirth: 'Enter a real date, like 14 March 1995' })
			changes.dateOfBirth = dob
		}
		if (!Object.keys(changes).length) return void (detailsSaved = true)
		detailsBusy = true
		try {
			await auth.patchProfile(changes)
			detailsSaved = true
		} catch (err) {
			detailsErrors = err instanceof ApiError && Object.keys(err.fields).length ? err.fields : { form: err instanceof ApiError ? err.message : 'Something went wrong.' }
		} finally {
			detailsBusy = false
		}
	}

	async function changePhone(e: SubmitEvent) {
		e.preventDefault()
		phoneError = ''
		try {
			await auth.call('/auth/phone/send', { body: { phone: '254' + newPhone.replace(/\D/g, '').replace(/^0/, '') } })
			await auth.reload()
			await goto('/verify-phone')
		} catch (err) {
			phoneError = err instanceof ApiError ? (err.fields.phone ?? err.message) : 'Something went wrong.'
		}
	}

	async function saveFacilities(e: SubmitEvent) {
		e.preventDefault()
		facError = ''
		facSaved = false
		facBusy = true
		try {
			auth.user = await auth.call('/me/facilities', { method: 'PUT', body: { homeFacilityId: home || null, extraFacilityIds: extras } })
			facSaved = true
		} catch (err) {
			facError = err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Something went wrong.'
		} finally {
			facBusy = false
		}
	}
	function add() {
		if (addExtra && extras.length < 5) extras = [...extras, addExtra]
		addExtra = ''
	}

	async function savePassword(e: SubmitEvent) {
		e.preventDefault()
		pwErrors = {}
		pwSaved = false
		if (newPw.length < 8) return void (pwErrors = { newPassword: 'Use at least 8 characters' })
		if (newPw !== newPw2) return void (pwErrors = { confirm: 'The two passwords do not match' })
		pwBusy = true
		try {
			await auth.changePassword(curPw, newPw)
			pwSaved = true
			curPw = newPw = newPw2 = ''
		} catch (err) {
			pwErrors = err instanceof ApiError && Object.keys(err.fields).length ? err.fields : { currentPassword: err instanceof ApiError ? err.message : 'Something went wrong.' }
		} finally {
			pwBusy = false
		}
	}

	async function deleteAccount(e: SubmitEvent) {
		e.preventDefault()
		delError = ''
		delBusy = true
		try {
			await auth.deleteAccount(delPw)
			await goto('/')
		} catch (err) {
			delError = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			delBusy = false
		}
	}
</script>

<svelte:head><title>Profile | {BRAND.name}</title></svelte:head>

<AccountShell active="profile">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Profile</h1>
		<p class="text-base leading-6 text-muted">Your details and the facilities that can reach you.</p>
	</header>

	<form onsubmit={saveDetails} class="card flex flex-col gap-5 p-6">
		<h2 class="text-[17px] font-bold">Your details</h2>
		{#if detailsSaved}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Profile saved.</strong>{#if !user.emailVerified} We sent a link to verify your new email.{/if}</p></div>{/if}
		{#if detailsErrors.form}<div class="notice-error" role="alert"><p>{detailsErrors.form}</p></div>{/if}
		<TextField id="name" label="Full name" autocomplete="name" bind:value={name} error={detailsErrors.name} />
		<div class="grid gap-5 sm:grid-cols-2">
			<div class="flex flex-col gap-2">
				<TextField id="email" label="Email" type="email" autocomplete="email" bind:value={email} error={detailsErrors.email} />
				<span class="flex items-center gap-1.5 text-[13px] font-semibold {user.emailVerified ? 'text-emerald-800' : 'text-amber-900'}"><Icon name={user.emailVerified ? 'check' : 'alert'} class="h-4 w-4" />{user.emailVerified ? 'Verified' : 'Not verified yet'}</span>
			</div>
			<div class="flex flex-col gap-2">
				<span class="field-label">Phone number</span>
				<div class="flex h-[52px] items-center rounded-xl border-[1.5px] border-rose-200 bg-rose-50 px-4 text-base font-semibold">{user.phone}</div>
				<span class="flex items-center gap-1.5 text-[13px] font-semibold {user.phoneVerified ? 'text-emerald-800' : 'text-amber-900'}"><Icon name={user.phoneVerified ? 'check' : 'alert'} class="h-4 w-4" />{user.phoneVerified ? 'Verified. Changing it needs a new code.' : 'Not verified yet'}</span>
				<button type="button" class="link h-9 self-start text-[15px]" onclick={() => (changingPhone = !changingPhone)}>Change number</button>
			</div>
		</div>
		<div class="grid gap-5 sm:grid-cols-2">
			<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0">
				<legend class="field-label mb-2 p-0">Sex</legend>
				<div class="grid grid-cols-2 gap-2">
					<label><input type="radio" name="sex" value="female" bind:group={sex} class="peer sr-only" /><span class="seg-box">Female</span></label>
					<label><input type="radio" name="sex" value="male" bind:group={sex} class="peer sr-only" /><span class="seg-box">Male</span></label>
				</div>
			</fieldset>
			<DobInput bind:value={dob} bind:touched={dobTouched} initial={user.dateOfBirth ?? ''} error={detailsErrors.dateOfBirth} />
		</div>
		<p class="text-[13px] leading-[18px] text-muted">Sex and date of birth decide your waiting time and age check. Blood type, weight, and last donation are recorded by medical facilities and cannot be edited here.</p>
		<button type="submit" class="btn-primary sm:!w-auto sm:self-start sm:px-10" disabled={detailsBusy}>{detailsBusy ? 'Saving…' : 'Save profile'}</button>
	</form>

	{#if changingPhone}
		<form onsubmit={changePhone} class="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
			<label for="new-phone" class="field-label">New phone number</label>
			<div class="flex gap-2"><span class="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-xl border-[1.5px] border-rose-200 bg-white text-base font-semibold">+254</span><input id="new-phone" type="tel" inputmode="numeric" placeholder="712 345 678" bind:value={newPhone} class="field-input min-w-0 flex-1" /></div>
			{#if phoneError}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{phoneError}</span>{/if}
			<button type="submit" class="btn-secondary" disabled={!newPhone}>Send a code to this number</button>
		</form>
	{/if}

	<form id="facilities" onsubmit={saveFacilities} class="card flex scroll-mt-6 flex-col gap-5 p-6">
		<div><h2 class="text-[17px] font-bold">Your facilities</h2><p class="mt-1 text-[15px] leading-[22px] text-muted">Alerts start from your home facility and widen outward. Add extra facilities you can easily reach.</p></div>
		{#if facSaved}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Facilities saved.</strong></p></div>{/if}
		{#if facError}<div class="notice-error" role="alert"><p>{facError}</p></div>{/if}
		<div class="flex flex-col gap-2">
			<label for="home" class="field-label">Home facility</label>
			<select id="home" bind:value={home} class="field-input">
				<option value="">Not chosen</option>
				{#each all.filter((f) => !extras.includes(f.id)) as f}<option value={f.id}>{f.name}, {f.town}</option>{/each}
			</select>
		</div>
		{#if extras.length}
			<ul class="flex flex-col gap-2">
				{#each extras as id}
					<li class="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><span class="flex items-center gap-3 text-[15px] font-semibold">{name_of(id)}<span class="badge badge-soft">Extra</span></span><button type="button" class="link h-9 text-sm" onclick={() => (extras = extras.filter((x) => x !== id))}>Remove</button></li>
				{/each}
			</ul>
		{/if}
		{#if extras.length < 5 && choices.length}
			<div class="flex gap-2"><select aria-label="Add another facility" bind:value={addExtra} class="field-input min-w-0 flex-1"><option value="">Add another facility</option>{#each choices as f}<option value={f.id}>{f.name}, {f.town}</option>{/each}</select><button type="button" class="btn-secondary !w-auto px-5" onclick={add} disabled={!addExtra}>Add</button></div>
		{/if}
		<a href="/profile/facility-missing" class="link self-start text-[15px]">My facility is not listed</a>
		<button type="submit" class="btn-primary sm:!w-auto sm:self-start sm:px-10" disabled={facBusy}>{facBusy ? 'Saving…' : 'Save facilities'}</button>
	</form>

	<form onsubmit={savePassword} class="card flex flex-col gap-4 p-6">
		<h2 class="text-[17px] font-bold">Password</h2>
		{#if pwSaved}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Password changed.</strong> Other devices were logged out.</p></div>{/if}
		<PasswordInput id="cur-pw" label="Current password" bind:value={curPw} error={pwErrors.currentPassword} />
		<div class="grid gap-5 sm:grid-cols-2">
			<PasswordInput id="new-pw" label="New password" autocomplete="new-password" placeholder="At least 8 characters" bind:value={newPw} error={pwErrors.newPassword} />
			<PasswordInput id="new-pw2" label="Confirm password" autocomplete="new-password" placeholder="Type it again" bind:value={newPw2} error={pwErrors.confirm} />
		</div>
		<button type="submit" class="btn-primary sm:!w-auto sm:self-start sm:px-10" disabled={pwBusy || !curPw || !newPw}>{pwBusy ? 'Saving…' : 'Change password'}</button>
	</form>

	<section class="flex flex-col gap-4 rounded-2xl border-[1.5px] border-red-300 bg-white p-6">
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div><h2 class="text-lg font-bold text-red-700">Delete my account</h2><p class="mt-1 max-w-md text-[15px] leading-[22px] text-muted">Removes your profile and stops all texts. Medical facilities keep donation records they already made.</p></div>
			{#if !deleting}<button type="button" onclick={() => (deleting = true)} class="btn-danger shrink-0">Delete account</button>{/if}
		</div>
		{#if deleting}
			<form onsubmit={deleteAccount} class="flex flex-col gap-4 rounded-xl border border-red-300 bg-red-50 p-4">
				<p class="text-[15px] font-semibold">This cannot be undone. Type your password to delete your account.</p>
				<PasswordInput id="del-pw" label="Password" bind:value={delPw} error={delError} />
				<div class="grid gap-3 sm:grid-cols-2"><button type="button" onclick={() => { deleting = false; delPw = ''; delError = '' }} class="btn-secondary">Keep my account</button><button type="submit" class="btn-danger" disabled={delBusy || !delPw}>{delBusy ? 'Deleting…' : 'Delete my account'}</button></div>
			</form>
		{/if}
	</section>
</AccountShell>
