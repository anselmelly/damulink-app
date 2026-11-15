<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDay } from '$lib/drives'
	import { driveHours, type DriveDetail, type DrivePublishInfo, type MyFacilityView } from '@damu/shared-types'
	import DrivePoster from '$lib/ui/DrivePoster.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const id = $derived(page.params.id)
	const did = $derived(page.params.did)
	let f = $state<MyFacilityView | null>(null)
	let d = $state<DriveDetail | null>(null)
	let info = $state<DrivePublishInfo | null>(null)
	let isPublic = $state(true)
	let smsEnabled = $state(true)
	let busy = $state(false)
	let error = $state('')
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			d = await auth.call<DriveDetail>(`/my-facilities/${id}/drives/${did}`)
			info = await auth.call<DrivePublishInfo>(`/my-facilities/${id}/drives/${did}/publish`)
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
		}
	})
	async function publish() {
		busy = true
		error = ''
		try {
			await auth.call(`/my-facilities/${id}/drives/${did}/publish`, { body: { isPublic, smsEnabled } })
			await goto(`/facility/${id}/drives/${did}?published=1`)
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>Publish blood drive | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="drives">
	<a href="/facility/{id}/drives/{did}/edit" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Edit details</a>
	<header class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Publish the drive</h1>{#if d}<p class="max-w-2xl text-base leading-6 text-muted">{d.host}, {longDay(d.date)}, {driveHours(d.starts, d.ends)}. Choose how to tell people.</p>{/if}</header>
	{#if d && info && f}
		<div class="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
			<div class="flex flex-col gap-6">
				<section class="card divide-y divide-rose-100">
					<label class="flex cursor-pointer items-center gap-4 p-6"><span class="flex-1"><span class="block text-lg font-bold">Public drive page</span><span class="text-[15px] leading-[22px] text-muted">A page on the {BRAND.name} site with an automatic poster people can share. Visitors can say they are interested.</span></span><input type="checkbox" bind:checked={isPublic} class="peer sr-only" /><span class="switch"></span></label>
					<label class="flex cursor-pointer items-center gap-4 p-6"><span class="flex-1"><span class="block text-lg font-bold">SMS to nearby verified donors</span><span class="text-[15px] leading-[22px] text-muted">One text to verified donors within about 25 km who are likely eligible on the day and have alerts on. It respects their alert limits.</span></span><input type="checkbox" bind:checked={smsEnabled} class="peer sr-only" /><span class="switch"></span></label>
				</section>
				<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Before you publish</h2>
					<ul class="flex flex-col gap-2 text-[15px] leading-[22px]">{#each ['Host contact stays private to your facility.', 'Interested visitors give a name and an optional phone. Those are deleted after the drive.', 'You can edit or cancel the drive any time before it starts.'] as t}<li class="flex gap-3"><Icon name="check" class="mt-0.5 h-5 w-5 shrink-0 text-red-700" />{t}</li>{/each}</ul>
				</section>
				{#if error}<p class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />{error}</p>{/if}
				<div class="flex gap-3"><a class="btn-secondary sm:!w-auto sm:px-8" href="/facility/{id}/drives/{did}/edit">Back</a><button type="button" class="btn-primary flex-1" disabled={busy || (!isPublic && !smsEnabled)} onclick={publish}>{busy ? 'Publishing…' : 'Publish drive'}</button></div>
			</div>
			<aside class="flex flex-col gap-4">
				{#if smsEnabled}
					<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Who would get the SMS</h2><p><span class="text-[36px] font-extrabold leading-10">{info.audience.total}</span> <span class="text-muted">donors</span></p><p class="rounded-xl bg-rose-50 p-3 text-[13px] leading-5 text-muted">Verified, likely eligible on {longDay(d.date)}, alerts on, within about 25 km or the same county. All blood types are welcome at a drive.</p></section>
				{/if}
				<h2 class="text-lg font-bold">Poster preview</h2>
				<DrivePoster host={d.host} venue={d.venue} town={d.town} facility={f.name} date={d.date} starts={d.starts} ends={d.ends} link={info.link} />
				{#if smsEnabled}<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">SMS preview</h2><p class="rounded-xl bg-rose-50 p-4 text-[15px] leading-[22px]">{info.sms.text}</p><p class="text-[13px] text-muted">One text, {info.sms.length} characters.</p></section>{/if}
			</aside>
		</div>
	{:else if error}
		<p class="notice-error" role="alert">{error}</p>
	{/if}
</FacilityShell>
