<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import { BLOOD_CHOICES } from '$lib/requests'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import type { DonorsList, MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let data = $state<DonorsList | null>(null)
	let q = $state('')
	let status = $state('')
	let bloodType = $state('')
	let pageNo = $state(1)
	let denied = $state(false)
	let loaded = $state(false)
	let error = $state('')
	let timer: ReturnType<typeof setTimeout> | undefined
	async function load() {
		error = ''
		const qs = new URLSearchParams({ page: String(pageNo) })
		if (q.trim()) qs.set('q', q.trim())
		if (status) qs.set('status', status)
		if (bloodType) qs.set('bloodType', bloodType)
		try {
			data = await auth.call<DonorsList>(`/my-facilities/${id}/donors?${qs}`)
		} catch (e) {
			if (e instanceof ApiError && e.status === 403) denied = true
			else error = e instanceof ApiError ? e.message : 'Something went wrong.'
		}
		loaded = true
	}
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
		} catch {}
		await load()
	})
	const refine = () => {
		pageNo = 1
		clearTimeout(timer)
		timer = setTimeout(load, 300)
	}
	const go = (n: number) => {
		pageNo = n
		void load()
	}
	const last = $derived(data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1)
</script>

<svelte:head><title>Donors | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="donors">
	<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">Donors</h1>
	{#if denied}
		<div class="card flex flex-col gap-3 p-8"><p class="font-bold">Only facility admins can see the donor list</p><p class="text-muted">You can still check a donor in by their code.</p><a class="btn-primary w-auto px-6" href="/facility/{id}/checkin">Check in a donor</a></div>
	{:else if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if data}
		<p class="text-muted">People who chose {f?.name} as a home facility. Admins only.</p>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each [['Home-facility donors', data.counts.all], ['Verified', data.counts.verified], ['Registered', data.counts.registered], ['Alerts on', data.counts.alertsOn]] as [l, n]}<div class="card p-5"><span class="block text-[28px] font-extrabold leading-8">{n}</span><span class="text-[14px] text-muted">{l}</span></div>{/each}
		</div>
		<div class="flex flex-col gap-3 sm:flex-row">
			<input aria-label="Search donors" placeholder="Search by name or code" bind:value={q} oninput={refine} class="field-input flex-1" />
			<select aria-label="Status" bind:value={status} onchange={refine} class="field-input sm:w-44"><option value="">All statuses</option><option value="verified">Verified</option><option value="registered">Registered</option></select>
			<select aria-label="Blood type" bind:value={bloodType} onchange={refine} class="field-input sm:w-36"><option value="">All types</option>{#each BLOOD_CHOICES as b}<option>{b}</option>{/each}</select>
		</div>
		{#if error}<p class="field-error" role="alert">{error}</p>{/if}
		{#if !data.items.length}
			<div class="card p-8 text-center text-muted">No donors match.</div>
		{:else}
			<ul class="card divide-y divide-rose-100">
				{#each data.items as d (d.code)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
						<span class="min-w-0 flex-1"><span class="block font-semibold">{d.name}{#if d.suspended} <span class="badge badge-neutral">Suspended</span>{/if}</span><span class="block text-[13px] text-muted">{d.code}</span></span>
						<span class="w-10 font-bold">{d.bloodType ?? '-'}</span>
						<span class="badge {d.verified ? 'badge-ok' : 'badge-neutral'}">{d.verified ? 'Verified' : 'Registered'}</span>
						<span class="w-32 text-[14px] text-muted">{d.lastDonationOn ? longDate(d.lastDonationOn) : 'None yet'}</span>
						<span class="w-36 text-[14px]">{d.eligibility}</span>
						<span class="text-[14px] text-muted">Alerts {d.alertsOn ? 'on' : 'off'}</span>
						<a class="link" href="/facility/{id}/checkin?code={encodeURIComponent(d.code)}">Check in</a>
					</li>
				{/each}
			</ul>
			<div class="flex items-center justify-between text-[14px] text-muted">
				<span>{(data.page - 1) * data.pageSize + 1} to {Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
				<span class="flex gap-2"><button type="button" class="btn-secondary w-auto px-5" disabled={data.page <= 1} onclick={() => go(data!.page - 1)}>Previous</button><button type="button" class="btn-secondary w-auto px-5" disabled={data.page >= last} onclick={() => go(data!.page + 1)}>Next</button></span>
			</div>
		{/if}
		<p class="field-help">Phone numbers are not shown here. You see a donor's number only after they reply YES to a call.</p>
	{/if}
</FacilityShell>
