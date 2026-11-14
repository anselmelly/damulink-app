<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { nairobiDateTime } from '$lib/dates'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { DonationRequestView } from '@damu/shared-types'

	let requests = $state<DonationRequestView[]>([])
	let loaded = $state(false)
	let tab = $state<'upcoming' | 'past'>('upcoming')
	let error = $state('')

	onMount(async () => {
		try {
			requests = await auth.call<DonationRequestView[]>('/me/donation-requests')
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not load your appointments.'
		}
		loaded = true
	})

	const upcoming = $derived(requests.filter((r) => r.status === 'requested' || r.status === 'scheduled'))
	const past = $derived(requests.filter((r) => !(r.status === 'requested' || r.status === 'scheduled')))
	const list = $derived(tab === 'upcoming' ? upcoming : past)

	const kindLabel = (r: DonationRequestView) => (r.kind === 'test' ? 'Blood type test' : 'Donation')
	const status: Record<string, [string, string]> = {
		requested: ['Requested', 'badge-warn'],
		scheduled: ['Scheduled', 'badge-ok'],
		completed: ['Completed', 'badge-ok'],
		cancelled: ['Cancelled', 'badge-neutral'],
		no_show: ['Did not attend', 'badge-neutral'],
	}
	const dayNames: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
	const when = { morning: 'mornings', afternoon: 'afternoons', any: 'any time' }
	const sent = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Africa/Nairobi' })
	const chip = (iso: string) => ({ month: new Date(iso).toLocaleDateString('en-GB', { month: 'short', timeZone: 'Africa/Nairobi' }), day: new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Africa/Nairobi' }) })

	async function cancel(id: string) {
		error = ''
		try {
			const u = await auth.call<DonationRequestView>(`/me/donation-requests/${id}/cancel`, { method: 'POST', body: {} })
			requests = requests.map((r) => (r.id === id ? u : r))
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
		}
	}
</script>

<svelte:head><title>Appointments | {BRAND.name}</title></svelte:head>

<AccountShell active="visits">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Appointments</h1>
			<p class="text-base leading-6 text-muted">Your requests to donate or get tested, and their dates.</p>
		</div>
		<a href="/donate" class="btn-primary sm:!w-auto sm:px-6">New request</a>
	</header>

	<nav aria-label="Appointment lists" class="flex gap-6 border-b border-rose-200">
		<button type="button" onclick={() => (tab = 'upcoming')} class="-mb-px flex h-12 items-center border-b-[3px] px-1 text-[15px] {tab === 'upcoming' ? 'border-rose-600 font-bold text-red-700' : 'border-transparent font-semibold text-muted hover:text-ink'}">Upcoming{#if upcoming.length}<span class="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs">{upcoming.length}</span>{/if}</button>
		<button type="button" onclick={() => (tab = 'past')} class="-mb-px flex h-12 items-center border-b-[3px] px-1 text-[15px] {tab === 'past' ? 'border-rose-600 font-bold text-red-700' : 'border-transparent font-semibold text-muted hover:text-ink'}">Past</button>
	</nav>

	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if requests.length === 0}
		<div class="card flex flex-col items-center gap-4 p-10 text-center">
			<span class="path-icon h-16 w-16"><Icon name="calendar" class="h-8 w-8" /></span>
			<h2 class="text-xl font-bold">No appointments yet</h2>
			<p class="max-w-md text-[15px] leading-[22px] text-muted">Ask a medical facility for a blood type test or a donation. They will call you to set a date.</p>
			<a href="/donate" class="btn-primary sm:!w-auto sm:px-8">Donate or get tested</a>
		</div>
	{:else if list.length === 0}
		<p class="text-[15px] text-muted">{tab === 'upcoming' ? 'Nothing coming up.' : 'Nothing in the past yet.'}</p>
	{:else}
		<ul class="flex flex-col gap-4">
			{#each list as r (r.id)}
				{@const [label, cls] = status[r.status]}
				{@const open = r.status === 'requested' || r.status === 'scheduled'}
				<li class="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
					{#if r.scheduledAt}
						{@const c = chip(r.scheduledAt)}
						<span class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl {open ? 'bg-rose-600 text-white' : 'bg-rose-100 text-red-700'}"><span class="text-xs font-bold uppercase tracking-wide">{c.month}</span><span class="text-2xl font-extrabold leading-7">{c.day}</span></span>
					{:else}
						<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-rose-200 bg-rose-50 text-red-700"><Icon name="clock" class="h-7 w-7" /></span>
					{/if}
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold leading-6">{kindLabel(r)}</h2><span class="badge {cls}">{label}</span></div>
						<p class="text-[15px] leading-[22px] text-muted">{r.scheduledAt ? `${nairobiDateTime(r.scheduledAt)} · ` : ''}{r.facilityName} · Sent {sent(r.createdAt)}</p>
						{#if r.status === 'requested'}<p class="text-[13px] text-muted">Waiting for the facility to call you with a date. Preferred: {r.days.map((d) => dayNames[d]).join(', ')} {when[r.timeOfDay]}.</p>{/if}
						{#if r.status === 'scheduled'}<p class="text-[13px] text-muted">We will remind you the day before and that morning.</p>{/if}
						{#if r.status === 'cancelled'}<p class="text-[13px] text-muted">You cancelled this request.</p>{/if}
						{#if r.status === 'no_show'}<p class="text-[13px] text-muted">No penalty. You can ask again any time.</p>{/if}
					</div>
					{#if open}
						<div class="flex gap-2 sm:flex-col"><button type="button" onclick={() => cancel(r.id)} class="link h-11 flex-1 px-2 text-[15px]">Cancel request</button></div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</AccountShell>
