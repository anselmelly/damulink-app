<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import { BLOOD_CHOICES } from '$lib/requests'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
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
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Donors</h1>
		{#if data}<p class="text-base leading-6 text-muted">People who chose {f?.name} as a home facility. Admins only.</p>{/if}
	</header>
	{#if denied}
		<div class="card flex flex-col gap-3 p-8"><p class="font-bold">Only facility admins can see the donor list</p><p class="text-muted">You can still check a donor in by their code.</p><a class="btn-primary sm:!w-auto sm:px-6" href="/facility/{id}/checkin">Check in a donor</a></div>
	{:else if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if data}
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
			{#each [['Home-facility donors', data.counts.all], ['Verified', data.counts.verified], ['Registered', data.counts.registered], ['Alerts on', data.counts.alertsOn]] as [l, n]}<div class="card p-5"><span class="block text-[34px] font-extrabold leading-10">{n}</span><span class="text-base text-muted">{l}</span></div>{/each}
		</div>
		<div class="flex flex-col gap-3 sm:flex-row">
			<div class="relative flex-1"><Icon name="search" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><input aria-label="Search donors" placeholder="Search by name or donor code" bind:value={q} oninput={refine} class="field-input !pl-12" /></div>
			<select aria-label="Status" bind:value={status} onchange={refine} class="field-input sm:!w-44"><option value="">All statuses</option><option value="verified">Verified</option><option value="registered">Registered</option></select>
			<select aria-label="Blood type" bind:value={bloodType} onchange={refine} class="field-input sm:!w-36"><option value="">All types</option>{#each BLOOD_CHOICES as b}<option>{b}</option>{/each}</select>
		</div>
		{#if error}<p class="notice-error" role="alert">{error}</p>{/if}
		{#if !data.items.length}
			<div class="card p-8 text-center text-muted">No donors match.</div>
		{:else}
			<div class="card overflow-x-auto">
				<table class="w-full min-w-[760px] text-left text-[15px]">
					<thead class="bg-rose-50 text-[12px] uppercase tracking-wider text-muted"><tr><th class="px-6 py-3.5 font-semibold">Donor</th><th class="px-3 py-3.5 font-semibold">Type</th><th class="px-3 py-3.5 font-semibold">Status</th><th class="px-3 py-3.5 font-semibold">Last donation</th><th class="px-3 py-3.5 font-semibold">Eligibility</th><th class="px-6 py-3.5 font-semibold">Alerts</th></tr></thead>
					<tbody class="divide-y divide-rose-100">
						{#each data.items as d (d.code)}
							<tr class="h-[67px]">
								<td class="px-6"><a class="link block leading-5" href="/facility/{id}/checkin?code={encodeURIComponent(d.code)}">{d.name}{#if d.suspended} <span class="badge badge-neutral">Suspended</span>{/if}</a><span class="block text-[13px] text-muted">{d.code}</span></td>
								<td class="px-3 font-bold text-rose-600">{d.bloodType ?? '-'}</td>
								<td class="px-3"><span class="badge {d.verified ? 'badge-ok' : 'badge-warn'}">{d.verified ? 'Verified' : 'Registered'}</span></td>
								<td class="px-3 text-muted">{d.lastDonationOn ? longDate(d.lastDonationOn) : 'None'}</td>
								<td class="px-3 {d.eligibility === 'Eligible now' ? 'font-semibold text-emerald-800' : 'text-muted'}">{d.eligibility}</td>
								<td class="px-6 text-muted">{d.alertsOn ? 'On' : 'Off'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		<p class="flex items-center gap-2 text-[13px] text-muted"><Icon name="lock" class="h-4 w-4" />Phone numbers are not shown here. You see a donor's number only after they reply YES to a call.</p>
		{#if data.items.length}
			<div class="flex items-center justify-between text-[15px] text-muted">
				<span>{(data.page - 1) * data.pageSize + 1} to {Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
				<span class="flex gap-2"><button type="button" class="btn-secondary sm:!w-auto sm:px-6" disabled={data.page <= 1} onclick={() => go(data!.page - 1)}>Previous</button><button type="button" class="btn-secondary sm:!w-auto sm:px-6" disabled={data.page >= last} onclick={() => go(data!.page + 1)}>Next</button></span>
			</div>
		{/if}
	{/if}
</FacilityShell>
