<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { DRIVE_PHASE, dayOf, longDay, monthOf } from '$lib/drives'
	import { driveHours, type DriveDay, type DriveDetail, type MyFacilityView } from '@damu/shared-types'
	import DrivePoster from '$lib/ui/DrivePoster.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const id = $derived(page.params.id)
	const did = $derived(page.params.did)
	let f = $state<MyFacilityView | null>(null)
	let d = $state<DriveDetail | null>(null)
	let day = $state<DriveDay | null>(null)
	let confirming = $state<'cancel' | 'close' | null>(null)
	let busy = $state(false)
	let error = $state('')
	const justPublished = page.url.searchParams.get('published') === '1'
	const base = $derived(`/my-facilities/${id}/drives/${did}`)
	async function load() {
		d = await auth.call<DriveDetail>(base)
		if (d.status === 'closed') return void goto(`/facility/${id}/drives/${did}/summary`, { replaceState: true })
		day = d.status === 'published' ? await auth.call<DriveDay>(`${base}/day`) : null
	}
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {}
	})
	async function run(path: string, then: () => Promise<void> | void) {
		busy = true
		error = ''
		try {
			await auth.call(`${base}/${path}`, { body: {} })
			confirming = null
			await then()
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
			confirming = null
		} finally {
			busy = false
		}
	}
	async function tick(p: DriveDay['people'][number], arrived: boolean) {
		error = ''
		try {
			await auth.call(`${base}/interest/${p.id}/arrived`, { body: { arrived } })
			p.arrived = arrived
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
		}
	}
	const live = $derived(day?.phase === 'day')
</script>

<svelte:head><title>Blood drive | {BRAND.name}</title></svelte:head>

<FacilityShell {f} width="wide" active="drives">
	<a href="/facility/{id}/drives" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Blood drives</a>
	{#if d && f}
		{#if justPublished}<p class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-emerald-700" />Published.{d.smsEnabled ? ' Nearby donors were texted.' : ''}</p>{/if}
		<header class="flex flex-col gap-4 sm:flex-row sm:items-start">
			<span class="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl {d.status === 'published' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}"><span class="text-[13px] font-bold leading-4">{monthOf(d.date)}</span><span class="text-[32px] font-extrabold leading-9">{dayOf(d.date)}</span></span>
			<div class="flex min-w-0 flex-1 flex-col gap-1.5">
				<p class="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">Blood drive · {d.code}</p>
				<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{d.host}</h1>
				<p class="flex flex-wrap items-center gap-3 text-base text-muted"><span class="badge {live ? 'badge-urgent' : (DRIVE_PHASE[d.phase]?.[0] ?? 'badge-neutral')}">{live ? 'Today, open now' : (DRIVE_PHASE[d.phase]?.[1] ?? d.phase)}</span>{driveHours(d.starts, d.ends)} · {d.venue}, {d.town}</p>
			</div>
			{#if d.isPublic && d.status === 'published'}<a class="btn-secondary flex !w-auto items-center gap-2 px-5" href="/drives/{d.code}" target="_blank" rel="noopener"><Icon name="share" />Public page</a>{/if}
		</header>
		{#if error}<p class="notice-error" role="alert">{error}</p>{/if}

		{#if day}
			{#if live}
				<section class="card flex flex-col gap-5 p-6" aria-label="Today so far">
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
						{#each [['Checked in', day.counts.checkedIn, 'text-ink'], ['Donated', day.counts.donated, 'text-emerald-700'], ['Walk-ins', day.counts.walkins, 'text-rose-600'], ['New sign-ups', day.counts.signups, 'text-rose-600']] as [l, n, c]}<div><span class="block text-[34px] font-extrabold leading-10 {c}">{n}</span><span class="text-base text-muted">{l}</span></div>{/each}
					</div>
					{#if day.target}
						<div class="flex flex-col gap-2"><div class="flex justify-between font-semibold"><span>Target</span><span>{day.counts.donated} of {day.target} donations</span></div><div class="h-2.5 overflow-hidden rounded-full bg-rose-100" role="progressbar" aria-valuenow={day.percent ?? 0} aria-valuemin="0" aria-valuemax="100" aria-label="Progress to target"><div class="h-full bg-emerald-600" style="width:{day.percent ?? 0}%"></div></div></div>
					{/if}
				</section>
			{:else}
				<p class="notice"><Icon name="calendar" class="mt-px h-[22px] w-[22px] text-red-700" /><span><b>The drive opens on {longDay(d.date)}.</b> Check-in and the live tracker unlock on the day. Until then you can watch who is interested.</span></p>
			{/if}

			<div class="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
				<section class="flex flex-col gap-3" aria-labelledby="int-h">
					<h2 id="int-h" class="flex items-center gap-3 text-xl font-bold">Said they are interested <span class="rounded-full bg-rose-100 px-2.5 text-[13px] leading-6 text-red-700">{day.people.length}</span></h2>
					<p class="flex items-center gap-2 text-[13px] text-muted"><Icon name="lock" class="h-4 w-4" />{live ? 'Ask arrivals if they posted an interest, then tick them. ' : ''}Names and phones are deleted after the drive.</p>
					{#if !day.people.length}
						<div class="card p-8 text-center text-muted">Nobody yet.</div>
					{:else}
						<div class="card overflow-x-auto">
							<table class="w-full min-w-[520px] text-left text-[15px]">
								<thead class="bg-rose-50 text-[12px] uppercase tracking-wider text-muted"><tr><th class="px-6 py-3.5 font-semibold">Name</th><th class="px-3 py-3.5 font-semibold">Phone</th><th class="px-3 py-3.5 font-semibold">Posted as</th>{#if live}<th class="px-6 py-3.5 text-right font-semibold">Arrived</th>{/if}</tr></thead>
								<tbody class="divide-y divide-rose-100">
									{#each day.people as p (p.id)}
										<tr class="h-[53px]"><td class="px-6 font-semibold">{p.name}</td><td class="px-3 text-muted">{p.phone ?? 'Name only'}</td><td class="px-3"><span class="badge {p.source === 'account' ? 'badge-ok' : 'badge-soft'}">{p.source === 'account' ? 'Account' : 'Guest'}</span></td>
											{#if live}<td class="px-6 text-right"><label class="inline-flex cursor-pointer items-center gap-3 font-semibold"><input type="checkbox" role="switch" class="peer sr-only" checked={p.arrived} onchange={(e) => tick(p, e.currentTarget.checked)} /><span class="relative h-8 w-14 rounded-full bg-rose-300 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-4 peer-focus-visible:ring-pink-300 after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-6"></span>Arrived</label></td>{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>
				<aside class="flex flex-col gap-4">
					{#if live}
						<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Donor arrives</h2><a class="btn-primary flex items-center justify-center gap-2" href="/facility/{id}/checkin?drive={d.id}"><Icon name="check" />Check in by code</a><a class="btn-secondary flex items-center justify-center gap-2" href="/facility/{id}/walkin?drive={d.id}"><Icon name="plus" />Add a walk-in</a></section>
					{/if}
					<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Drive details</h2>
						<dl class="flex flex-col gap-2 text-[15px]"><div><dt class="text-[13px] text-muted">Host contact (private)</dt><dd class="font-semibold">{d.contactName ?? 'None'}{d.contactPhone ? ` · ${d.contactPhone}` : ''}</dd></div><div><dt class="text-[13px] text-muted">Target</dt><dd class="font-semibold">{d.target ? `${d.target} donors` : 'None'}</dd></div></dl>
						{#if day.canEdit}<a class="btn-secondary" href="/facility/{id}/drives/{did}/edit">Edit details</a>{/if}
					</section>
					{#if live}
						<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Finished for the day?</h2><p class="text-[13px] text-muted">Closing takes the public page down and gives you the summary.</p><button type="button" id="close-drive" class="btn-secondary" onclick={() => (confirming = 'close')}>Close drive</button></section>
					{:else if day.canCancel}
						<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Cancel the drive?</h2><p class="text-[13px] text-muted">Only before it starts. The public page comes down and interested people get one text.</p><button type="button" id="cancel-drive" class="btn-danger" onclick={() => (confirming = 'cancel')}>Cancel drive</button></section>
					{/if}
					{#if !live}<DrivePoster host={d.host} venue={d.venue} town={d.town} facility={f.name} date={d.date} starts={d.starts} ends={d.ends} link="{location.origin}/d/{d.short}" />{/if}
				</aside>
			</div>
		{:else}
			<div class="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
				<div class="flex flex-col gap-6">
					<section class="card flex flex-col gap-3 p-6 md:p-8"><h2 class="text-xl font-bold">Details</h2><p class="text-[15px] leading-[22px]">{d.publicText}</p>
						<dl class="grid gap-3 text-[15px] sm:grid-cols-2"><div><dt class="text-[13px] text-muted">Told</dt><dd class="font-semibold">{d.isPublic ? 'Public page' : ''}{d.isPublic && d.smsEnabled ? ' and ' : ''}{d.smsEnabled ? 'SMS to nearby donors' : ''}{!d.isPublic && !d.smsEnabled ? 'Not published yet' : ''}</dd></div><div><dt class="text-[13px] text-muted">Target</dt><dd class="font-semibold">{d.target ? `${d.target} donors` : 'None'}</dd></div><div><dt class="text-[13px] text-muted">Host contact (private)</dt><dd class="font-semibold">{d.contactName ?? 'None'}{d.contactPhone ? ` · ${d.contactPhone}` : ''}</dd></div></dl>
					</section>
					{#if d.canEdit}
						<div class="flex flex-wrap gap-3">
							{#if d.status === 'draft'}<a class="btn-primary sm:!w-auto sm:px-8" href="/facility/{id}/drives/{did}/publish">Publish</a>{/if}
							<a class="btn-secondary sm:!w-auto sm:px-8" href="/facility/{id}/drives/{did}/edit">Edit</a>
							<button type="button" class="btn-danger sm:!w-auto sm:px-8" onclick={() => (confirming = 'cancel')}>Cancel drive</button>
						</div>
					{/if}
				</div>
				<aside class="flex flex-col gap-3"><DrivePoster host={d.host} venue={d.venue} town={d.town} facility={f.name} date={d.date} starts={d.starts} ends={d.ends} link="{location.origin}/d/{d.short}" /></aside>
			</div>
		{/if}

		{#if confirming}
			<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="cd-h">
				<div class="card flex w-full max-w-md flex-col gap-4 p-6">
					{#if confirming === 'cancel'}
						<h2 id="cd-h" class="text-xl font-extrabold">Cancel this drive?</h2><p class="text-muted">The page comes down and nobody new can say they are interested. People who said they are coming get one text, then the list is deleted.</p>
						<div class="flex gap-3"><button type="button" class="btn-danger sm:!w-auto sm:px-6" disabled={busy} onclick={() => run('cancel', load)}>{busy ? 'Cancelling…' : 'Cancel the drive'}</button><button type="button" class="btn-secondary sm:!w-auto sm:px-6" onclick={() => (confirming = null)}>Keep it</button></div>
					{:else}
						<h2 id="cd-h" class="text-xl font-extrabold">Close this drive?</h2><p class="text-muted">The public page comes down and the interested list is deleted. The counts stay for the summary.</p>
						<div class="flex gap-3"><button type="button" class="btn-primary sm:!w-auto sm:px-6" disabled={busy} onclick={() => run('close', () => goto(`/facility/${id}/drives/${did}/summary?closed=1`))}>{busy ? 'Closing…' : 'Close the drive'}</button><button type="button" class="btn-secondary sm:!w-auto sm:px-6" onclick={() => (confirming = null)}>Not yet</button></div>
					{/if}
				</div>
			</div>
		{/if}
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
