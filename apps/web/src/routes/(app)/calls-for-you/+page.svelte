<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate } from '$lib/dates'
	import { ago, plural } from '$lib/requests'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { DonorCall, DonorCalls } from '@damu/shared-types'

	let data = $state<DonorCalls | null>(null)
	let loaded = $state(false)
	let error = $state('')
	let thanks = $state<DonorCall | null>(null)
	let busy = $state('')
	const load = async () => (data = await auth.call<DonorCalls>('/donor/calls'))
	onMount(async () => {
		try {
			await load()
		} catch (e) {
			error = e instanceof ApiError && e.status === 403 ? 'Calls are for donors aged 18 to 65.' : 'Could not load calls.'
		}
		loaded = true
	})
	async function yes(c: DonorCall) {
		busy = c.code
		error = ''
		try {
			await auth.call(`/donor/calls/${c.code}/accept`, { method: 'POST' })
			thanks = c
			await load()
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong.'
			await load().catch(() => {})
		} finally {
			busy = ''
		}
	}
</script>

<svelte:head><title>Calls for you | {BRAND.name}</title></svelte:head>

<AccountShell active="calls">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Calls for you</h1>
		<p class="max-w-2xl text-base leading-6 text-muted">Open calls that fit your blood type, from your facility and nearby ones. One tap is the same as replying YES to the SMS.</p>
	</header>
	{#if thanks}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">Thank you. {thanks.facility} has your yes.</strong> They will contact you with a day and time.</p></div>{/if}
	{#if error}<p class="notice-error" role="alert">{error}</p>{/if}
	{#if !loaded}<p class="text-muted" role="status">Loading…</p>
	{:else if data?.state === 'unverified'}
		<section class="card flex flex-col items-center gap-4 p-8 text-center md:p-10">
			<h2 class="text-xl font-bold">Calls appear once you are verified</h2>
			<p class="max-w-md text-[15px] leading-[22px] text-muted">A medical facility confirms your blood type with a test or your first donation. After that you will see calls that fit you here, and get SMS alerts.</p>
			<a href="/donate" class="btn-primary sm:!w-auto sm:px-8">Donate or get tested</a>
		</section>
	{:else if data}
		{#if data.state === 'waiting' && data.nextEligibleOn}<div class="notice" role="status"><Icon name="clock" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">You can donate again on {longDate(data.nextEligibleOn)}.</strong> You can read open calls, but saying yes opens then. Please share a call instead.</p></div>{/if}
		{#if !data.items.length}
			<div class="card flex flex-col items-center gap-4 p-10 text-center">
				<h2 class="text-xl font-bold">No open calls for your blood type right now</h2>
				<p class="max-w-md text-[15px] leading-[22px] text-muted">We will text you when one comes up. You can change how often in alert settings.</p>
				<a href="/alerts" class="btn-secondary sm:!w-auto sm:px-8">Alert settings</a>
			</div>
		{:else}
			<ul class="flex flex-col gap-4">
				{#each data.items as c (c.code)}
					<li class="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 {data.state === 'waiting' ? 'opacity-70' : ''}">
						<a href="/calls/{c.code}" class="flex min-w-0 flex-1 items-center gap-4">
							<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-[26px] font-extrabold text-rose-600">{c.bloodType}</span>
							<span class="flex min-w-0 flex-1 flex-col gap-1">
								<span class="flex flex-wrap items-center gap-2"><span class="text-lg font-bold leading-6">{c.facility}</span>{#if c.accepted}<span class="badge badge-ok"><Icon name="check" class="h-4 w-4" />You said yes</span>{:else if c.urgency !== 'normal'}<span class="badge badge-urgent">{c.urgency === 'surge' ? 'Surge' : 'Urgent'}</span>{/if}</span>
								<span class="text-[15px] leading-[22px] text-muted">{c.town} · {c.where} · {ago(c.postedAt)}</span>
								<span class="text-[13px] text-muted">{c.code} · needs {plural(c.stillNeeded, 'more unit')}</span>
							</span>
						</a>
						{#if c.accepted}<a href="/calls/{c.code}" class="btn-secondary !h-11 sm:!w-auto sm:px-5">See details</a>
						{:else if data.state === 'ok'}<button type="button" class="btn-primary !h-11 text-[15px] sm:!w-auto sm:px-5" disabled={!!busy} onclick={() => yes(c)}><Icon name="check" />{busy === c.code ? 'Sending…' : 'Yes, I can donate'}</button>
						{:else}<span class="text-[13px] text-muted sm:w-40 sm:text-right">You can say yes again after {data.nextEligibleOn ? longDate(data.nextEligibleOn).replace(/ \d{4}$/, '') : 'your waiting period'}</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
	<p class="flex items-start gap-3 text-sm leading-5 text-muted"><Icon name="lock" class="mt-0.5 h-5 w-5 shrink-0" />Calls never show the patient. The facility checks you on the day and has the final say.</p>
</AccountShell>
