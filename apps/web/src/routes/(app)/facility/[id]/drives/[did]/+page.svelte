<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { DRIVE_PHASE, longDay } from '$lib/drives'
	import { driveHours, type DriveDetail, type MyFacilityView } from '@damu/shared-types'
	import DrivePoster from '$lib/ui/DrivePoster.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const id = $derived(page.params.id)
	const did = $derived(page.params.did)
	let f = $state<MyFacilityView | null>(null)
	let d = $state<DriveDetail | null>(null)
	let confirming = $state(false)
	let busy = $state(false)
	let error = $state('')
	const justPublished = page.url.searchParams.get('published') === '1'
	const load = async () => (d = await auth.call<DriveDetail>(`/my-facilities/${id}/drives/${did}`))
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {}
	})
	async function cancel() {
		busy = true
		error = ''
		try {
			await auth.call(`/my-facilities/${id}/drives/${did}/cancel`, { body: {} })
			confirming = false
			await load()
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Blood drive | {BRAND.name}</title></svelte:head>

<FacilityShell {f} width="mid" active="drives">
	<a href="/facility/{id}/drives" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Blood drives</a>
	{#if d && f}
		{#if justPublished}<p class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-emerald-700" />Published.{d.smsEnabled ? ' Nearby donors were texted.' : ''}</p>{/if}
		<header class="flex flex-col gap-2">
			<p class="flex items-center gap-3 text-[13px] text-muted"><span class="badge {DRIVE_PHASE[d.phase]?.[0] ?? 'badge-neutral'}">{DRIVE_PHASE[d.phase]?.[1] ?? d.phase}</span>{d.code}</p>
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{d.host}</h1>
			<p class="text-base text-muted">{longDay(d.date)} · {driveHours(d.starts, d.ends)} · {d.venue}, {d.town}</p>
		</header>
		<div class="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
			<div class="flex flex-col gap-6">
				<section class="card flex flex-col gap-3 p-6 md:p-8"><h2 class="text-xl font-bold">Details</h2><p class="text-[15px] leading-[22px]">{d.publicText}</p>
					<dl class="grid gap-3 text-[15px] sm:grid-cols-2"><div><dt class="text-[13px] text-muted">Told</dt><dd class="font-semibold">{d.isPublic ? 'Public page' : ''}{d.isPublic && d.smsEnabled ? ' and ' : ''}{d.smsEnabled ? 'SMS to nearby donors' : ''}{!d.isPublic && !d.smsEnabled ? 'Not published yet' : ''}</dd></div><div><dt class="text-[13px] text-muted">Target</dt><dd class="font-semibold">{d.target ? `${d.target} donors` : 'None'}</dd></div><div><dt class="text-[13px] text-muted">Host contact (private)</dt><dd class="font-semibold">{d.contactName ?? 'None'}{d.contactPhone ? ` · ${d.contactPhone}` : ''}</dd></div></dl>
				</section>
				{#if error}<p class="notice-error" role="alert">{error}</p>{/if}
				{#if d.canEdit}
					<div class="flex flex-wrap gap-3">
						{#if d.status === 'draft'}<a class="btn-primary sm:!w-auto sm:px-8" href="/facility/{id}/drives/{did}/publish">Publish</a>{/if}
						<a class="btn-secondary sm:!w-auto sm:px-8" href="/facility/{id}/drives/{did}/edit">Edit</a>
						<button type="button" class="btn-danger sm:!w-auto sm:px-8" onclick={() => (confirming = true)}>Cancel drive</button>
					</div>
				{:else if d.status === 'published'}
					<div class="notice"><Icon name="info" class="mt-px h-[22px] w-[22px] text-red-700" /><p>The drive has started. The live tracker comes in the next update.</p></div>
				{/if}
			</div>
			<aside class="flex flex-col gap-3"><DrivePoster host={d.host} venue={d.venue} town={d.town} facility={f.name} date={d.date} starts={d.starts} ends={d.ends} link="{location.origin}/d/{d.short}" /></aside>
		</div>
		{#if confirming}
			<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="cd-h">
				<div class="card flex w-full max-w-md flex-col gap-4 p-6"><h2 id="cd-h" class="text-xl font-extrabold">Cancel this drive?</h2><p class="text-muted">The page comes down and nobody new can say they are interested.</p><div class="flex gap-3"><button type="button" class="btn-danger sm:!w-auto sm:px-6" disabled={busy} onclick={cancel}>{busy ? 'Cancelling…' : 'Cancel the drive'}</button><button type="button" class="btn-secondary sm:!w-auto sm:px-6" onclick={() => (confirming = false)}>Keep it</button></div></div>
			</div>
		{/if}
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
