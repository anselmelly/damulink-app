<script lang="ts">
	import { ApiError } from '$lib/api'
	import DrivePoster from '$lib/ui/DrivePoster.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import TextField from '$lib/ui/TextField.svelte'

	type Values = { host: string; venue: string; town: string; date: string; starts: string; ends: string; publicText: string; target: string; contactName: string; contactPhone: string }
	let { initial, facility, link, label, cancelHref, save }: { initial: Values; facility: string; link: string; label: string; cancelHref: string; save: (body: Record<string, unknown>) => Promise<void> } = $props()
	// svelte-ignore state_referenced_locally
	let v = $state<Values>({ ...initial })
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	async function submit(e: SubmitEvent) {
		e.preventDefault()
		busy = true
		error = ''
		errors = {}
		try {
			await save({ ...v, target: v.target.trim() ? Number(v.target) : null, contactName: v.contactName || null, contactPhone: v.contactPhone || null })
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

<div class="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
	<form class="flex flex-col gap-6" onsubmit={submit}>
		<section class="card flex flex-col gap-5 p-6 md:p-8">
			<h2 class="text-xl font-bold">Where and when</h2>
			<TextField id="host" label="Host institution" bind:value={v.host} error={errors.host ?? ''} help={'Shown on the public page and poster as "Hosted with".'} />
			<TextField id="venue" label="Venue" bind:value={v.venue} error={errors.venue ?? ''} />
			<TextField id="town" label="Town" bind:value={v.town} error={errors.town ?? ''} help="Used for the town filter on the public list." />
			<div class="flex flex-col gap-2"><label for="date" class="field-label">Date</label><input id="date" type="date" bind:value={v.date} class="field-input {errors.date ? 'is-error' : ''}" />{#if errors.date}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.date}</span>{/if}</div>
			<div class="grid grid-cols-2 gap-4">
				<div class="flex flex-col gap-2"><label for="starts" class="field-label">Starts</label><input id="starts" type="time" bind:value={v.starts} class="field-input {errors.starts ? 'is-error' : ''}" />{#if errors.starts}<span class="field-error">{errors.starts}</span>{/if}</div>
				<div class="flex flex-col gap-2"><label for="ends" class="field-label">Ends</label><input id="ends" type="time" bind:value={v.ends} class="field-input {errors.ends ? 'is-error' : ''}" />{#if errors.ends}<span class="field-error">{errors.ends}</span>{/if}</div>
			</div>
		</section>
		<section class="card flex flex-col gap-4 p-6 md:p-8">
			<div><h2 class="text-xl font-bold">Public text</h2><p class="mt-1 text-[15px] text-muted">Shown on the drive page and poster. Keep it short.</p></div>
			<textarea id="text" bind:value={v.publicText} rows="3" maxlength="200" aria-label="Public text" class="field-input !h-auto py-3 {errors.publicText ? 'is-error' : ''}"></textarea>
			{#if errors.publicText}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors.publicText}</span>{/if}
			<p class="text-right text-[13px] text-muted">{v.publicText.length} of 200</p>
		</section>
		<section class="card flex flex-col gap-5 p-6 md:p-8">
			<h2 class="text-xl font-bold">Extras <span class="font-normal text-muted">(optional)</span></h2>
			<TextField id="target" label="Target number of donors" bind:value={v.target} inputmode="numeric" error={errors.target ?? ''} help="Only your attendants see this. It drives the live tracker." />
			<div class="notice"><Icon name="lock" class="mt-px h-[22px] w-[22px] text-red-700" /><p>The contact below is private to your facility. It never appears on the public page, poster or SMS.</p></div>
			<div class="grid gap-4 sm:grid-cols-2"><TextField id="cn" label="Host contact name" bind:value={v.contactName} error={errors.contactName ?? ''} /><TextField id="cp" label="Host contact phone" bind:value={v.contactPhone} type="tel" inputmode="tel" error={errors.contactPhone ?? ''} /></div>
		</section>
		{#if error}<p class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />{error}</p>{/if}
		<div class="flex gap-3"><a class="btn-secondary sm:!w-auto sm:px-8" href={cancelHref}>Cancel</a><button class="btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : label}</button></div>
	</form>
	<aside class="flex flex-col gap-3 lg:sticky lg:top-6">
		<h2 class="text-lg font-bold">Poster preview</h2>
		<DrivePoster host={v.host} venue={v.venue} town={v.town} {facility} date={v.date} starts={v.starts} ends={v.ends} {link} />
		<p class="text-[13px] text-muted">Made for you from the details. It updates as you type.</p>
	</aside>
</div>
