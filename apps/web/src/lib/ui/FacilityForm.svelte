<script lang="ts">
	import { ApiError } from '$lib/api'
	import { COUNTIES } from '$lib/counties'
	import Icon from './Icon.svelte'
	import TextField from './TextField.svelte'
	import { FACILITY_TYPES } from '@damu/shared-types'

	type Values = { name: string; type: string; licenseNumber: string; owner: string; county: string; town: string; address: string; lat: string; lng: string; phone: string; email: string; role: string; note: string }
	let { initial = {}, submitLabel = 'Submit for verification', cancelHref = '/dashboard', save }: { initial?: Partial<Values>; submitLabel?: string; cancelHref?: string; save: (input: Record<string, unknown>) => Promise<void> } = $props()

	// svelte-ignore state_referenced_locally: the form starts from the given values
	let v = $state<Values>({ name: '', type: 'hospital', licenseNumber: '', owner: '', county: '', town: '', address: '', lat: '', lng: '', phone: '', email: '', role: '', note: '', ...initial })
	let authorised = $state(false)
	let errors = $state<Record<string, string>>({})
	let error = $state('')
	let busy = $state(false)
	let locating = $state('')

	const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

	function locate() {
		locating = ''
		if (!navigator.geolocation) return void (locating = 'Your browser cannot share its location. Type the coordinates instead.')
		navigator.geolocation.getCurrentPosition(
			(p) => {
				v.lat = p.coords.latitude.toFixed(6)
				v.lng = p.coords.longitude.toFixed(6)
			},
			() => (locating = 'Could not get your location. Type the coordinates instead.'),
			{ enableHighAccuracy: true, timeout: 10_000 },
		)
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		errors = {}
		error = ''
		const lat = Number(v.lat), lng = Number(v.lng)
		if (!v.lat.trim() || Number.isNaN(lat)) errors.lat = 'Enter the latitude'
		if (!v.lng.trim() || Number.isNaN(lng)) errors.lng = 'Enter the longitude'
		if (!authorised) errors.authorised = 'You need to confirm this to continue'
		if (errors.lat || errors.lng || errors.authorised) return
		busy = true
		try {
			await save({ ...v, lat, lng, owner: v.owner || undefined, address: v.address || undefined, note: v.note || undefined, authorised: true })
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else error = err instanceof ApiError ? err.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<form onsubmit={submit} class="card flex flex-col gap-8 p-6 md:p-8">
	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

	<fieldset class="flex min-w-0 flex-col gap-5 border-0 p-0">
		<legend class="eyebrow mb-4 p-0">The facility</legend>
		<TextField id="fname" label="Facility name" placeholder="Rift County Hospital" bind:value={v.name} error={errors.name} />
		<div class="grid gap-5 sm:grid-cols-2">
			<div class="flex flex-col gap-2">
				<label for="ftype" class="field-label">Type</label>
				<select id="ftype" bind:value={v.type} class="field-input {errors.type ? 'is-error' : ''}">{#each FACILITY_TYPES as t}<option value={t}>{label(t)}</option>{/each}</select>
				{#if errors.type}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.type}</span>{/if}
			</div>
			<TextField id="license" label="License number" placeholder="As on the facility license" bind:value={v.licenseNumber} error={errors.licenseNumber} help="We check it against the licensing body." />
		</div>
		<TextField id="owner" label="Owner or operator (optional)" placeholder="County government, mission, private" bind:value={v.owner} error={errors.owner} />
	</fieldset>

	<hr class="border-rose-100" />

	<fieldset class="flex min-w-0 flex-col gap-5 border-0 p-0">
		<legend class="eyebrow mb-4 p-0">Where it is</legend>
		<div class="grid gap-5 sm:grid-cols-2">
			<div class="flex flex-col gap-2">
				<label for="county" class="field-label">County</label>
				<select id="county" bind:value={v.county} class="field-input {errors.county ? 'is-error' : ''}"><option value="">Choose a county</option>{#each COUNTIES as c}<option>{c}</option>{/each}</select>
				{#if errors.county}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.county}</span>{/if}
			</div>
			<TextField id="town" label="Town" placeholder="Nakuru" bind:value={v.town} error={errors.town} />
		</div>
		<TextField id="addr" label="Street or landmark (optional)" placeholder="Off Kenyatta Avenue, next to the bus park" bind:value={v.address} error={errors.address} />
		<div class="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
			<p class="field-label">GPS pin</p>
			<p class="text-[15px] leading-[22px] text-muted">Alerts spread from facility to facility by distance, so we need a pin. Stand at the main entrance if you can.</p>
			<button type="button" onclick={locate} class="btn-secondary !h-11 text-[15px] sm:!w-auto sm:self-start sm:px-6">Use my current location</button>
			{#if locating}<span class="field-help" role="status">{locating}</span>{/if}
			<div class="grid gap-3 sm:grid-cols-2">
				<TextField id="lat" label="Latitude" inputmode="text" placeholder="-0.3031" bind:value={v.lat} error={errors.lat} />
				<TextField id="lng" label="Longitude" inputmode="text" placeholder="36.0800" bind:value={v.lng} error={errors.lng} />
			</div>
			<span class="field-help">A reviewer confirms the pin before the facility is verified.</span>
		</div>
	</fieldset>

	<hr class="border-rose-100" />

	<fieldset class="flex min-w-0 flex-col gap-5 border-0 p-0">
		<legend class="eyebrow mb-4 p-0">How to reach it</legend>
		<div class="grid gap-5 sm:grid-cols-2">
			<TextField id="fphone" label="Main phone" type="tel" inputmode="tel" placeholder="+254 57 202 0000" bind:value={v.phone} error={errors.phone} help="A switchboard or blood bank line we can call to confirm." />
			<TextField id="femail" label="Facility email" type="email" placeholder="bloodbank@facility.example" bind:value={v.email} error={errors.email} />
		</div>
		<TextField id="role" label="Your role at the facility" placeholder="Laboratory in charge" bind:value={v.role} error={errors.role} />
		<div class="flex flex-col gap-2">
			<label for="fnote" class="field-label">Anything that helps us verify <span class="font-normal text-muted">(optional)</span></label>
			<textarea id="fnote" rows="3" bind:value={v.note} placeholder="For example, the name of the medical superintendent we can call" class="w-full rounded-xl border-[1.5px] border-field bg-white p-4 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"></textarea>
		</div>
	</fieldset>

	<div>
		<label for="auth" class="flex items-start gap-3 text-sm leading-[21px]"><input id="auth" type="checkbox" bind:checked={authorised} class="mt-px h-6 w-6 shrink-0 accent-rose-600" /><span>I am authorised to register this facility, and the details above are correct.</span></label>
		{#if errors.authorised}<span class="field-error mt-2"><Icon name="alert" class="h-4 w-4" />{errors.authorised}</span>{/if}
	</div>

	<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
		<a href={cancelHref} class="btn-secondary sm:px-8">Cancel</a>
		<button type="submit" class="btn-primary" disabled={busy}>{busy ? 'Sending…' : submitLabel}</button>
	</div>
</form>
