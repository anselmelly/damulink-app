<script lang="ts">
	import QRCode from 'qrcode'
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { COUNTIES } from '$lib/counties'
	import { STATUS } from '$lib/facility-status'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import TextField from '$lib/ui/TextField.svelte'
	import { FACILITY_TYPES, type FacilityStats, type MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let stats = $state<FacilityStats | null>(null)
	let denied = $state(false)
	let v = $state({ name: '', type: 'hospital', county: '', town: '', address: '', owner: '', phone: '', email: '', lat: '', lng: '' })
	let errors = $state<Record<string, string>>({})
	let saved = $state('')
	let busy = $state(false)
	let qr = $state('')
	let copied = $state(false)

	const link = $derived(f?.slug ? `${location.origin}/join/${f.slug}` : '')

	function fill(x: MyFacilityView) {
		f = x
		v = { name: x.name, type: x.type, county: x.county, town: x.town, address: x.address ?? '', owner: x.owner ?? '', phone: x.phone ?? '', email: x.email ?? '', lat: x.lat == null ? '' : String(x.lat), lng: x.lng == null ? '' : String(x.lng) }
	}
	onMount(async () => {
		try {
			const x = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			if (x.role !== 'admin') return void (denied = true)
			fill(x)
			stats = await auth.call<FacilityStats>(`/my-facilities/${id}/stats`)
			if (x.slug) qr = await QRCode.toString(`${location.origin}/join/${x.slug}`, { type: 'svg', margin: 1, width: 220, color: { dark: '#2A1218', light: '#FFFFFF' } })
		} catch {
			denied = true
		}
	})

	async function save(e: SubmitEvent) {
		e.preventDefault()
		errors = {}
		saved = ''
		busy = true
		try {
			const lat = Number(v.lat), lng = Number(v.lng)
			fill(await auth.call<MyFacilityView>(`/my-facilities/${id}/profile`, { method: 'PATCH', body: { name: v.name, type: v.type, county: v.county, town: v.town, address: v.address, owner: v.owner, phone: v.phone, email: v.email, lat: v.lat ? lat : undefined, lng: v.lng ? lng : undefined } }))
			await auth.reload()
			saved = f?.status === 'pending' ? 'Saved. Because the pin moved, a reviewer will confirm the new location before the facility is verified again.' : 'Facility details saved.'
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length) errors = err.fields
			else errors = { form: err instanceof ApiError ? err.message : 'Something went wrong.' }
		} finally {
			busy = false
		}
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(link)
			copied = true
			setTimeout(() => (copied = false), 2000)
		} catch {
			/* the link is on screen to copy by hand */
		}
	}
	const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
	const download = $derived(qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : '')
</script>

<svelte:head><title>Facility profile | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="profile">
	{#if denied}
		<div class="card flex flex-col items-center gap-4 p-10 text-center"><span class="path-icon h-16 w-16"><Icon name="lock" class="h-8 w-8" /></span><h2 class="text-xl font-bold">Only facility admins can open this page</h2><p class="max-w-md text-[15px] text-muted">Ask an admin if you need a detail changed.</p></div>
	{:else if f}
		<header class="flex flex-col gap-1.5">
			<div class="flex flex-wrap items-center gap-3"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Facility profile</h1><span class="badge {STATUS[f.status][0]}">{STATUS[f.status][1]}</span></div>
			<p class="text-base leading-6 text-muted">Only facility admins can see and edit this page.</p>
		</header>

		{#if stats}
			<section class="grid gap-4 sm:grid-cols-3">
				{#each [[stats.homeDonors, 'Donors with this as home facility', 'Registered and verified'], [stats.verifiedDonors, 'Verified donors', 'Blood type recorded'], [stats.registeredDonors, 'Registered, not yet verified', 'Waiting for a test or donation']] as [n, l, d]}
					<div class="card p-5"><p class="text-[32px] font-extrabold leading-none tracking-tight">{n}</p><p class="mt-2 text-[15px] font-bold leading-5">{l}</p><p class="text-[13px] text-muted">{d}</p></div>
				{/each}
			</section>
		{/if}

		{#if saved}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">{saved}</strong></p></div>{/if}
		{#if errors.form}<div class="notice-error" role="alert"><p>{errors.form}</p></div>{/if}

		<div class="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
			{#if f.status === 'verified' || f.status === 'pending'}
				<form onsubmit={save} class="flex flex-col gap-6">
					<section class="card flex flex-col gap-5 p-6">
						<h2 class="text-lg font-bold">Details</h2>
						<TextField id="n" label="Facility name" bind:value={v.name} error={errors.name} />
						<div class="grid gap-5 sm:grid-cols-2">
							<div class="flex flex-col gap-2"><label for="t" class="field-label">Type</label><select id="t" bind:value={v.type} class="field-input">{#each FACILITY_TYPES as t}<option value={t}>{label(t)}</option>{/each}</select></div>
							<div class="flex flex-col gap-2"><span class="field-label">License number</span><div class="flex h-[52px] items-center rounded-xl border-[1.5px] border-rose-200 bg-rose-50 px-4 text-base text-muted">{f.licenseNumber}</div><span class="field-help">Locked after verification. Contact {BRAND.name} to change it.</span></div>
						</div>
						<TextField id="o" label="Owner or operator" bind:value={v.owner} error={errors.owner} />
					</section>
					<section class="card flex flex-col gap-5 p-6">
						<h2 class="text-lg font-bold">Location</h2>
						<div class="grid gap-5 sm:grid-cols-2">
							<div class="flex flex-col gap-2"><label for="c" class="field-label">County</label><select id="c" bind:value={v.county} class="field-input">{#each COUNTIES as c}<option>{c}</option>{/each}</select></div>
							<TextField id="tw" label="Town" bind:value={v.town} error={errors.town} />
						</div>
						<TextField id="a" label="Street or landmark" bind:value={v.address} error={errors.address} />
						<div class="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
							<p class="field-label">GPS pin</p>
							<div class="grid gap-3 sm:grid-cols-2"><TextField id="lat" label="Latitude" bind:value={v.lat} error={errors.lat} /><TextField id="lng" label="Longitude" bind:value={v.lng} error={errors.lng} /></div>
							<span class="field-help">Alert distances between facilities are measured from this pin. Moving it sends it back to {BRAND.name} to confirm.</span>
						</div>
					</section>
					<section class="card flex flex-col gap-5 p-6">
						<h2 class="text-lg font-bold">Contact</h2>
						<div class="grid gap-5 sm:grid-cols-2"><TextField id="p" label="Main phone" type="tel" bind:value={v.phone} error={errors.phone} /><TextField id="e" label="Facility email" type="email" bind:value={v.email} error={errors.email} /></div>
					</section>
					<button type="submit" class="btn-primary sm:!w-auto sm:self-start sm:px-10" disabled={busy}>{busy ? 'Saving…' : 'Save facility details'}</button>
				</form>
			{:else}
				<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>You can edit details here once the facility is verified. <a href="/facility/{f.id}" class="link">See its status</a></p></div>
			{/if}

			<aside class="flex flex-col gap-6 xl:sticky xl:top-8">
				<section class="card flex flex-col gap-4 p-6">
					<h2 class="text-lg font-bold">Invite donors</h2>
					{#if f.status === 'verified' && link}
						<p class="text-[15px] leading-[22px] text-muted">Share this link or QR code. Donors who join with it have {f.name} chosen as their home facility. They join by choice; you never register anyone.</p>
						<div class="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3"><span class="min-w-0 flex-1 truncate text-[15px] font-bold text-red-700">{link}</span><button type="button" aria-label="Copy invite link" title="Copy" onclick={copy} class="link flex h-9 w-9 shrink-0 items-center justify-center"><Icon name={copied ? 'check' : 'copy'} class="h-5 w-5" /></button></div>
						{#if qr}
							<div class="flex flex-col items-center gap-3 rounded-xl border border-rose-200 p-4">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- the QR image is generated here from our own link -->
								<div class="h-[220px] w-[220px]" role="img" aria-label="QR code for the invite link">{@html qr}</div>
								<a href={download} download="{f.slug}-invite-qr.svg" class="link text-[15px]">Download the QR code</a>
							</div>
						{/if}
					{:else}
						<p class="text-[15px] leading-[22px] text-muted">The invite link and QR code appear once the facility is verified.</p>
					{/if}
				</section>
				<section class="card flex flex-col gap-2 p-6"><h2 class="text-lg font-bold">Facility code</h2><p class="rounded-xl bg-rose-50 py-3 text-center text-[19px] font-extrabold tracking-wider text-red-700">{f.facilityCode}</p><p class="text-[13px] leading-[18px] text-muted">Your team types this on the login page to open the facility side.</p></section>
			</aside>
		</div>
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
