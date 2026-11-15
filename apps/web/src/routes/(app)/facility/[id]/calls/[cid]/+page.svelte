<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { CALL_STATUS, CLOSE_CHOICES, CLOSE_TEXT, RESPONSE_STATUS, closesOn, shortLink, urgencyLabel } from '$lib/calls'
	import { nairobiDateTime } from '$lib/dates'
	import { ago, plural, toIso, todayNairobi } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import { compatibleTypes, type CallDetail, type MyFacilityView, type RingStat } from '@damu/shared-types'

	const id = $derived(page.params.id)
	const cid = $derived(page.params.cid)
	let f = $state<MyFacilityView | null>(null)
	let d = $state<CallDetail | null>(null)
	let missing = $state(false)
	let busy = $state(false)
	let error = $state('')
	let errors = $state<Record<string, string>>({})
	let dialog = $state<'schedule' | 'extend' | 'close' | 'edit' | 'more' | null>(null)
	let rings = $state<{ rings: RingStat[]; nextRing: number | null } | null>(null)
	let target = $state('') // the donor answer being scheduled
	let date = $state('')
	let time = $state('09:00')
	let days = $state(1)
	let reason = $state('covered')
	let text = $state('')
	let types = $state<string[]>([])
	let copied = $state(false)
	const published = page.url.searchParams.get('published') === '1'

	const base = $derived(`/my-facilities/${id}/calls/${cid}`)
	const load = async () => {
		d = await auth.call<CallDetail>(base)
		rings = d.smsEnabled ? await auth.call<{ rings: RingStat[]; nextRing: number | null }>(`${base}/rings`).catch(() => null) : null
	}
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			await load()
		} catch {
			missing = true
		}
	})
	async function act(path: string, body?: unknown, method = 'POST') {
		error = ''
		errors = {}
		busy = true
		try {
			await auth.call(`${base}${path}`, { method, body: body ?? {} })
			dialog = null
			await load()
		} catch (e) {
			if (e instanceof ApiError) {
				errors = e.fields
				error = Object.keys(e.fields).length ? '' : e.message
			} else error = 'Something went wrong.'
			if (e instanceof ApiError && e.code === 'invalid_move') await load().catch(() => {})
		} finally {
			busy = false
		}
	}
	const open = (k: typeof dialog) => {
		error = ''
		errors = {}
		if (k === 'edit' && d) {
			text = d.publicText
			types = [...d.types]
		}
		if (k === 'extend' && d) days = Math.min(1, d.canExtendDays) || 1
		dialog = k
	}
	const toggle = (t: string) => (types = types.includes(t) ? types.filter((x) => x !== t) : [...types, t])
	const link = $derived(d ? shortLink(location.origin, d.short) : '')
	async function copy() {
		await navigator.clipboard?.writeText(link).catch(() => {})
		copied = true
		setTimeout(() => (copied = false), 2000)
	}
</script>

<svelte:head><title>{d ? d.number : 'Call'} | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="calls">
	<a href="/facility/{id}/calls" class="link inline-flex items-center gap-1 self-start text-[15px]"><Icon name="chev-l" class="h-5 w-5" />Calls</a>
	{#if missing}
		<div class="card p-8 text-center"><h1 class="text-xl font-bold">Call not found</h1></div>
	{:else if !d}
		<p class="text-muted" role="status">Loading…</p>
	{:else}
		{#if published}<div class="notice" role="status"><Icon name="check" class="mt-px h-5 w-5 shrink-0 text-green-700" /><p>The call is live. Share the link to reach more people.</p></div>{/if}
		<header class="flex flex-col gap-3">
			<p class="text-[13px] font-semibold text-muted">{d.number} · <a href="/facility/{id}/requests/{d.request.id}" class="link">{d.request.number}</a> · {d.request.patientRef}</p>
			<div class="flex flex-wrap items-center gap-3">
				<BloodChip type={d.bloodType} />
				<h1 class="text-[26px] font-extrabold leading-8 tracking-tight md:text-[32px] md:leading-9">{d.bloodType} blood, {plural(d.units.needed, 'unit')}</h1>
				<span class="badge {CALL_STATUS[d.status][0]}">{CALL_STATUS[d.status][1]}</span>
			</div>
			<p class="text-[15px] text-muted">{urgencyLabel(d.urgency)} · {d.status === 'live' ? `closes ${closesOn(d.closesAt)}` : `ended ${d.closedAt ? closesOn(d.closedAt) : ''}${d.closeReason ? ` · ${CLOSE_TEXT[d.closeReason] ?? d.closeReason}` : ''}`}</p>
		</header>
		{#if error}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>{error}</p></div>{/if}

		<section class="card flex flex-col gap-4 p-6 md:p-8" aria-label="Units">
			<div class="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
				{#each [['Needed', d.units.needed], ['Donated', d.units.donated], ['Scheduled', d.units.scheduled], ['Still needed', d.units.stillNeeded]] as [l, n]}<div><p class="text-3xl font-extrabold">{n}</p><p class="text-[14px] text-muted">{l}</p></div>{/each}
			</div>
		</section>

		<section class="card flex flex-col gap-3 p-6 md:p-8">
			<h2 class="text-lg font-bold">Public page</h2>
			<p class="text-[15px]">{d.publicText}</p>
			<p class="text-[14px] text-muted">For {d.types.join(', ')} donors · {d.isPublic ? 'listed on the calls page' : 'not listed'}</p>
			{#if d.isPublic}
				<div class="flex flex-wrap items-center gap-3 text-[15px]"><code class="rounded bg-rose-50 px-2 py-1">{link}</code><button type="button" onclick={copy} class="link">{copied ? 'Copied' : 'Copy link'}</button><a href="/calls/{d.number}" target="_blank" class="link">Open page</a><a href="/calls/{d.number}/share" target="_blank" class="link">Poster</a></div>
			{/if}
		</section>

		{#if rings}
			<section class="card flex flex-col gap-3 p-6 md:p-8" aria-label="Alerts sent">
				<h2 class="text-lg font-bold">Alerts sent</h2>
				<ul class="flex flex-col gap-1 text-[15px]">{#each rings.rings as r}<li class="flex flex-wrap justify-between gap-x-4"><span>Ring {r.ring}</span><span class="text-muted">{r.alerted} alerted · {r.replied} replied · {r.toAlert} still to alert</span></li>{/each}</ul>
			</section>
		{/if}

		<section class="card flex flex-col gap-4 p-6 md:p-8">
			<h2 class="text-lg font-bold">Donors who said YES</h2>
			{#if !d.responses.length}
				<p class="text-[15px] text-muted">No one yet. Donors who say yes will appear here with a masked phone number.</p>
			{:else}
				<ul class="flex flex-col divide-y divide-rose-100">
					{#each d.responses as r}
						<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
							<span class="min-w-0 flex-1"><span class="block font-bold">{r.name}</span><span class="block text-[14px] text-muted">{r.phone} · {ago(r.repliedAt)} · ring {r.ring}{r.scheduledAt ? ` · ${nairobiDateTime(r.scheduledAt)}` : ''}</span></span>
							{#if r.bloodType}<BloodChip type={r.bloodType} size="sm" />{/if}
							<span class="badge {RESPONSE_STATUS[r.status][0]}">{RESPONSE_STATUS[r.status][1]}</span>
							{#if d.status === 'live' && (r.status === 'willing' || r.status === 'scheduled')}
								<button type="button" class="link text-[14px]" onclick={() => { target = r.id; date = ''; open('schedule') }}>Schedule</button>
								<button type="button" class="link text-[14px]" onclick={() => act(`/responses/${r.id}/not-needed`)}>Not needed</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if d.status === 'live'}
			<section class="flex flex-col gap-3 sm:flex-row">
				<button type="button" onclick={() => open('edit')} class="btn-secondary sm:!w-auto sm:px-6">Edit text and types</button>
				{#if d.smsEnabled && rings?.nextRing}<button type="button" onclick={() => open('more')} class="btn-secondary sm:!w-auto sm:px-6">Alert more donors</button>{/if}
				<button type="button" onclick={() => open('extend')} disabled={!d.canExtendDays} class="btn-secondary sm:!w-auto sm:px-6">Extend</button>
				<button type="button" onclick={() => open('close')} class="btn-danger sm:!w-auto sm:px-6">Close call</button>
			</section>
		{/if}

		{#if dialog}
			<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Call action">
				<div class="card flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto p-6">
					{#if error}<p class="field-error" role="alert">{error}</p>{/if}
					{#if dialog === 'schedule'}
						<h2 class="text-xl font-bold">Schedule this donor</h2>
						<div class="grid gap-3 sm:grid-cols-2"><div class="flex flex-col gap-2"><label for="sd" class="field-label">Date</label><input id="sd" type="date" min={todayNairobi()} bind:value={date} class="field-input" /></div><div class="flex flex-col gap-2"><label for="st" class="field-label">Time</label><input id="st" type="time" bind:value={time} class="field-input" /></div></div>
						{#if errors.scheduledAt}<span class="field-error">{errors.scheduledAt}</span>{/if}
						<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onclick={() => (dialog = null)} class="btn-secondary sm:!w-auto sm:px-6">Cancel</button><button type="button" disabled={busy || !date} onclick={() => act(`/responses/${target}/schedule`, { scheduledAt: toIso(date, time) })} class="btn-primary sm:!w-auto sm:px-6">Schedule</button></div>
					{:else if dialog === 'more' && rings}
						<h2 class="text-xl font-bold">Alert the next ring?</h2>
						<p class="text-[15px] text-muted">Ring {rings.nextRing} has {rings.rings.find((r) => r.ring === rings!.nextRing)?.toAlert ?? 0} donors who match. They get the SMS now, not at the scheduled time.</p>
						<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onclick={() => (dialog = null)} class="btn-secondary sm:!w-auto sm:px-6">Not now</button><button type="button" disabled={busy} onclick={() => act('/alert-more')} class="btn-primary sm:!w-auto sm:px-6">Alert ring {rings.nextRing}</button></div>
					{:else if dialog === 'extend'}
						<h2 class="text-xl font-bold">Extend this call</h2>
						<p class="text-[15px] text-muted">A call can stay open for 7 days in all. You can add up to {d.canExtendDays} more.</p>
						<div class="flex gap-2">{#each [1, 2, 3].filter((n) => n <= d!.canExtendDays) as n}<label><input type="radio" name="ext" value={n} bind:group={days} class="peer sr-only" /><span class="seg-box !w-24">{plural(n, 'day')}</span></label>{/each}</div>
						{#if errors.days}<span class="field-error">{errors.days}</span>{/if}
						<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onclick={() => (dialog = null)} class="btn-secondary sm:!w-auto sm:px-6">Cancel</button><button type="button" disabled={busy} onclick={() => act('/extend', { days })} class="btn-primary sm:!w-auto sm:px-6">Extend</button></div>
					{:else if dialog === 'close'}
						<h2 class="text-xl font-bold">Close this call?</h2>
						<p class="text-[15px] text-muted">The public page shows it as closed and the request is closed too.</p>
						<div class="flex flex-col gap-2"><label for="cr" class="field-label">Reason</label><select id="cr" bind:value={reason} class="field-input">{#each CLOSE_CHOICES as [k, l]}<option value={k}>{l}</option>{/each}</select></div>
						<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onclick={() => (dialog = null)} class="btn-secondary sm:!w-auto sm:px-6">Keep open</button><button type="button" disabled={busy} onclick={() => act('/close', { reason })} class="btn-danger sm:!w-auto sm:px-6">Close call</button></div>
					{:else}
						<h2 class="text-xl font-bold">Edit text and types</h2>
						<div class="flex flex-col gap-2"><label for="et" class="field-label">Public text</label><textarea id="et" rows="3" maxlength="140" bind:value={text} class="field-input !h-auto py-3"></textarea>{#if errors.publicText}<span class="field-error">{errors.publicText}</span>{/if}</div>
						<div class="flex flex-wrap gap-2">{#each compatibleTypes(d.bloodType) as t}<label><input type="checkbox" checked={types.includes(t)} onchange={() => toggle(t)} class="peer sr-only" /><span class="seg-box !w-20">{t}</span></label>{/each}</div>
						{#if errors.types}<span class="field-error">{errors.types}</span>{/if}
						<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onclick={() => (dialog = null)} class="btn-secondary sm:!w-auto sm:px-6">Cancel</button><button type="button" disabled={busy || !types.length} onclick={() => act('', { publicText: text, types }, 'PATCH')} class="btn-primary sm:!w-auto sm:px-6">Save</button></div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</FacilityShell>
