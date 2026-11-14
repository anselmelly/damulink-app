<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { REQUEST_STATUS, plural, sentAt } from '$lib/requests'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { RequestStatus, RequestSummary } from '@damu/shared-types'

	let active = $state<RequestSummary[]>([])
	let closed = $state<RequestSummary[]>([])
	let loaded = $state(false)
	let tab = $state<'active' | 'closed'>('active')
	let error = $state('')

	onMount(async () => {
		try {
			;[active, closed] = await Promise.all([auth.call<RequestSummary[]>('/requests?bucket=active'), auth.call<RequestSummary[]>('/requests?bucket=closed')])
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not load your requests.'
		}
		loaded = true
	})
	const list = $derived(tab === 'active' ? active : closed)

	// One short line under each request, in the requester's words.
	const line = (r: RequestSummary): string =>
		({
			pending: `Sent ${sentAt(r.createdAt)}. Waiting for the facility.`,
			needs_info: 'The facility has a question for you.',
			confirmed: 'The facility confirmed it with the ward and is deciding.',
			approved: 'Approved. The facility may share a call.',
			published: 'A call is live.',
			closed: 'The facility closed this request.',
			rejected: 'The facility could not approve this request.',
			cancelled: 'You cancelled this request.',
		})[r.status as RequestStatus]
</script>

<svelte:head><title>My requests | {BRAND.name}</title></svelte:head>

<AccountShell active="requests">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">My requests</h1>
			<p class="text-base leading-6 text-muted">Requests you sent to medical facilities for a patient.</p>
		</div>
		<a href="/request" class="btn-primary sm:!w-auto sm:px-6"><Icon name="drop" class="h-5 w-5" />Request blood</a>
	</header>

	<nav aria-label="Request lists" class="flex gap-6 border-b border-rose-200">
		<button type="button" onclick={() => (tab = 'active')} class="-mb-px flex h-12 items-center border-b-[3px] px-1 text-[15px] {tab === 'active' ? 'border-rose-600 font-bold text-red-700' : 'border-transparent font-semibold text-muted hover:text-ink'}">Active{#if active.length}<span class="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs">{active.length}</span>{/if}</button>
		<button type="button" onclick={() => (tab = 'closed')} class="-mb-px flex h-12 items-center border-b-[3px] px-1 text-[15px] {tab === 'closed' ? 'border-rose-600 font-bold text-red-700' : 'border-transparent font-semibold text-muted hover:text-ink'}">Closed</button>
	</nav>

	{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

	{#if !loaded}
		<p class="text-muted" role="status">Loading…</p>
	{:else if active.length + closed.length === 0}
		<div class="card flex flex-col items-center gap-4 p-10 text-center">
			<span class="path-icon h-16 w-16"><Icon name="clipboard" class="h-8 w-8" /></span>
			<h2 class="text-xl font-bold">No requests yet</h2>
			<p class="max-w-md text-[15px] leading-[22px] text-muted">If someone you know needs blood, ask their facility to confirm and share a call.</p>
			<a href="/request" class="btn-primary sm:!w-auto sm:px-8">Request blood for someone</a>
		</div>
	{:else if list.length === 0}
		<p class="card p-8 text-center text-muted">Nothing here.</p>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each list as r (r.id)}
				<li>
					<a href="/requests/{r.id}" class="card flex items-center gap-4 p-4 hover:bg-rose-50/60 md:p-5">
						<BloodChip type={r.bloodType} />
						<span class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="flex flex-wrap items-center gap-x-3 gap-y-1"><span class="truncate font-bold">{r.facilityName}</span><span class="badge {REQUEST_STATUS[r.status][0]}">{REQUEST_STATUS[r.status][1]}</span></span>
							<span class="text-[13px] text-muted">{r.number} · {plural(r.units, 'unit')} · {r.facilityTown}</span>
							<span class="text-[14px] leading-5">{line(r)}</span>
						</span>
						<Icon name="chev-r" class="h-5 w-5 shrink-0 text-muted" />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</AccountShell>
