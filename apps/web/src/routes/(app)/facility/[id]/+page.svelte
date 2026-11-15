<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import { longDate, nairobiDateTime } from '$lib/dates'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	const justSubmitted = $derived(page.url.searchParams.get('submitted') === '1')
	let f = $state<MyFacilityView | null>(null)
	let missing = $state(false)
	let reply = $state('')
	let replyError = $state('')
	let busy = $state(false)
	let copied = $state(false)

	async function load() {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			// a verified facility lands on Home; the nav's "Facility status" link adds ?status=1 to stay here
			if (f.status === 'verified' && !justSubmitted && page.url.searchParams.get('status') !== '1') return void goto(`/facility/${id}/home`, { replaceState: true })
		} catch {
			missing = true
		}
	}
	onMount(load)

	// badge class, badge text, heading, text, steps reached
	const states: Record<string, [string, string, string, string, number]> = {
		incomplete: ['badge-neutral', 'Profile incomplete', 'Finish your facility profile', 'Add where the facility is and how to reach it. The review starts once the profile is complete. Nothing is published meanwhile.', 0],
		pending: ['badge-warn', 'Pending', 'We are checking your facility', 'A reviewer is confirming that it exists and where it is. This usually takes a few working days. Nothing is published meanwhile.', 1],
		needs_info: ['badge-warn', 'More information needed', 'We have a question', 'Please answer below so the review can continue.', 1],
		verified: ['badge-ok', 'Verified', 'is verified', 'You are now the facility admin. Add your attendants, then you can raise requests and publish calls.', 3],
		rejected: ['badge-bad', 'Not approved', 'We could not verify this facility', 'You can read why below. If the details were wrong, you can correct them and submit again.', 2],
		suspended: ['badge-neutral', 'Suspended', 'This facility is suspended', 'It cannot publish calls or alert donors for now. Attendants can still see past records.', 3],
	}
	const steps = ['Submitted', `Checked by ${BRAND.name}`, 'Verified']
	const last = (kind: string) => f?.messages.filter((m) => m.kind === kind).at(-1)

	async function send(e: SubmitEvent) {
		e.preventDefault()
		replyError = ''
		busy = true
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}/reply`, { body: { text: reply } })
			reply = ''
			await auth.reload()
		} catch (err) {
			replyError = err instanceof ApiError ? (err.fields.text ?? err.message) : 'Something went wrong.'
		} finally {
			busy = false
		}
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(f?.facilityCode ?? '')
			copied = true
			setTimeout(() => (copied = false), 2000)
		} catch {
			/* the code is on screen to copy by hand */
		}
	}
</script>

<svelte:head><title>{f?.name ?? 'Facility'} | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="status">
	{#if missing}
		<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" /><p>We could not find this facility. <a href="/dashboard" class="link">Back to the dashboard</a></p></div>
	{:else if f}
		{@const [bcls, btext, h, text, n] = states[f.status]}
		<header class="flex flex-col gap-1.5">
			{#if f.submittedAt}<p class="text-sm font-bold uppercase tracking-[.14em] text-muted">Submitted {longDate(f.submittedAt.slice(0, 10))}</p>{/if}
			<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{f.name}</h1>
			<p class="text-base text-muted">{f.town} · {f.type.charAt(0).toUpperCase() + f.type.slice(1)}{f.licenseNumber ? ` · License ${f.licenseNumber}` : ''}</p>
		</header>

		{#if justSubmitted}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><p><strong class="font-bold">{f.name} is submitted.</strong> We will email you at {auth.user?.email} when a reviewer has decided.</p></div>{/if}

		{#if f.facilityCode}
			<section class="card flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-col gap-1">
					<h2 class="text-lg font-bold">Your facility code</h2>
					<p class="max-w-xl text-[15px] leading-[22px] text-muted">Type it on the login page, under "Signing in to a facility?", to open this facility. It picks the facility, it is not a password.</p>
				</div>
				<div class="flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3"><span class="text-[19px] font-extrabold tracking-wider text-red-700">{f.facilityCode}</span><button type="button" aria-label="Copy facility code" title="Copy" onclick={copy} class="link flex h-9 w-9 items-center justify-center"><Icon name={copied ? 'check' : 'copy'} class="h-5 w-5" /></button></div>
			</section>
		{/if}

		<section class="card overflow-hidden">
			<div class="flex flex-col gap-2 p-6 md:p-8">
				<span class="badge {bcls} self-start">{btext}</span>
				<h2 class="text-[24px] font-extrabold leading-8 tracking-tight">{f.status === 'verified' ? `${f.name} ${h}` : h}</h2>
				<p class="max-w-2xl text-[15px] leading-[22px] text-muted">{text}</p>
			</div>
			<ol class="grid gap-px border-t border-rose-200 bg-rose-200 sm:grid-cols-3">
				{#each steps as s, i}
					<li class="flex items-center gap-3 bg-white px-5 py-4 {i + 1 > n ? 'text-muted' : ''}">
						{#if i + 1 <= n}<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white {f.status === 'rejected' && i + 1 === n ? 'bg-red-700' : 'bg-rose-600'}"><Icon name="check" class="h-4 w-4" /></span>
						{:else}<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-rose-200 text-sm font-extrabold">{i + 1}</span>{/if}
						<span class="text-sm font-semibold leading-5">{s}</span>
					</li>
				{/each}
			</ol>
		</section>

		{#if f.status === 'incomplete'}
			<section class="card flex flex-col gap-4 p-6">
				<h2 class="text-lg font-bold">What is left</h2>
				<ol class="flex flex-col gap-3 text-[15px]">
					{#each [[auth.user?.phoneVerified ?? false, 'Phone verified', 'Verify your phone with the code we texted.', '/verify-phone'], [auth.user?.emailVerified ?? false, 'Email verified', 'Open the link we emailed you.', '/verify-email'], [false, 'Complete the facility profile', 'Where it is, how to reach it, and the license number. The review starts after this.', `/facility/${f.id}/edit`]] as [done, t, d, href]}
						<li class="flex items-center gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {done ? 'bg-rose-600 text-white' : 'border-[1.5px] border-rose-200 text-sm font-extrabold'}">{#if done}<Icon name="check" class="h-4 w-4" />{:else}•{/if}</span><span><span class="block font-semibold">{t}</span><span class="text-[13px] text-muted">{d}</span>{#if !done}<a href={href as string} class="link ml-2 text-[13px]">Open</a>{/if}</span></li>
					{/each}
				</ol>
				<a href="/facility/{f.id}/edit" class="btn-primary sm:!w-auto sm:self-start sm:px-8">Complete the facility profile</a>
			</section>
		{:else if f.status === 'needs_info'}
			<section class="card flex flex-col gap-4 p-6">
				<h2 class="text-lg font-bold">Message from the {BRAND.name} reviewer</h2>
				<p class="rounded-xl bg-rose-50 p-4 text-[15px] leading-[22px]">{last('ask')?.text}</p>
				<form onsubmit={send} class="flex flex-col gap-3">
					<label for="areply" class="field-label">Your reply</label>
					<textarea id="areply" rows="3" bind:value={reply} placeholder="Type your answer" class="w-full rounded-xl border-[1.5px] border-field bg-white p-4 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"></textarea>
					{#if replyError}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{replyError}</span>{/if}
					<button type="submit" class="btn-primary sm:!w-auto sm:self-start sm:px-8" disabled={busy || reply.trim().length < 2}>{busy ? 'Sending…' : 'Send reply'}</button>
				</form>
			</section>
		{:else if f.status === 'rejected'}
			<section class="card flex flex-col gap-4 border-red-300 p-6">
				<h2 class="flex items-center gap-2 text-lg font-bold text-red-800">Reason from the reviewer</h2>
				<p class="rounded-xl bg-red-50 p-4 text-[15px] leading-[22px]">{last('reject')?.text}</p>
				{#if f.role === 'admin'}<a href="/facility/{f.id}/edit" class="btn-primary sm:!w-auto sm:self-start sm:px-8">Correct and submit again</a>{/if}
			</section>
		{:else if f.status === 'suspended'}
			<section class="card flex flex-col gap-3 p-6">
				<h2 class="text-lg font-bold">What this means</h2>
				<ul class="flex flex-col gap-2 text-[15px] leading-[22px]"><li>No new calls, drives, or SMS alerts.</li><li>Existing donor and request records stay safe.</li><li>If you think this is a mistake, contact {BRAND.name} support.</li></ul>
			</section>
		{:else if f.status === 'verified'}
			<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">What is next</h2><p class="text-[15px] leading-[22px] text-muted">{f.role === 'admin' ? 'Add your attendants so they can work on requests and calls (raising requests and publishing calls are coming soon).' : 'Requests, calls and check-in are coming soon. An admin at your facility can add more people to the team.'}</p>{#if f.role === 'admin'}<div class="flex flex-col gap-3 sm:flex-row"><a href="/facility/{f.id}/attendants" class="btn-primary sm:!w-auto sm:px-8">Add your attendants</a><a href="/facility/{f.id}/profile" class="btn-secondary sm:!w-auto sm:px-8">Invite donors with a link</a></div>{/if}</section>
		{/if}

		{#if f.messages.length > 1 || (f.messages.length === 1 && f.status !== 'needs_info' && f.status !== 'rejected')}
			<section class="card flex flex-col gap-3 p-6">
				<h2 class="text-lg font-bold">Conversation with the reviewer</h2>
				<ul class="flex flex-col gap-3">
					{#each f.messages as m}
						<li class="rounded-xl p-4 text-[15px] leading-[22px] {m.kind === 'reply' ? 'bg-white border border-rose-200' : 'bg-rose-50'}"><span class="block text-[13px] font-semibold text-muted">{m.kind === 'reply' ? 'You' : 'Reviewer'} · {nairobiDateTime(m.at)}</span>{m.text}</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
