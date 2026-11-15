<script lang="ts">
	import { BRAND } from '$lib/brand'
	import { closesOn, shortLink, urgencyLabel } from '$lib/calls'
	import { sentAt } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'
	import { page } from '$app/state'

	let { data } = $props()
	const c = $derived(data.call)
	const live = $derived(c.status === 'live')
	const link = $derived(shortLink(page.url.origin, c.short))
	let copied = $state(false)
	async function copy() {
		await navigator.clipboard?.writeText(link).catch(() => {})
		copied = true
		setTimeout(() => (copied = false), 2000)
	}
</script>

<svelte:head>
	<title>{c.bloodType} blood needed at {c.facility.name} | {BRAND.name}</title>
	<meta name="description" content={c.publicText} />
	<meta property="og:title" content="{c.bloodType} blood needed at {c.facility.name}, {c.facility.town}" />
	<meta property="og:description" content={c.publicText} />
</svelte:head>

<PublicNav />
<main class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
	<a href="/calls" class="link inline-flex items-center gap-1 self-start text-[15px]"><Icon name="chev-l" class="h-5 w-5" />Open calls</a>
	{#if !live}<div class="notice" role="status"><Icon name="info" class="mt-px h-5 w-5 shrink-0" /><p>This call is closed. Thank you to everyone who helped.</p></div>{/if}
	<header class="flex flex-col gap-3">
		<p class="text-[13px] font-semibold text-muted">Posted {sentAt(c.publishedAt)} · Call {c.code}</p>
		<div class="flex items-center gap-4"><BloodChip type={c.bloodType} /><h1 class="text-[28px] font-extrabold leading-9 tracking-tight md:text-[36px] md:leading-[42px]">{c.bloodType} blood needed</h1>{#if c.urgency !== 'normal'}<span class="badge badge-urgent">{urgencyLabel(c.urgency)}</span>{/if}</div>
		<p class="flex flex-wrap items-center gap-x-3 text-[16px]"><span class="font-bold">{c.facility.name}</span><span class="flex items-center gap-1 text-muted"><Icon name="pin" class="h-4 w-4" />{c.facility.town}, {c.facility.county}</span><span class="badge badge-ok"><Icon name="shield" class="h-4 w-4" />Verified medical facility</span></p>
	</header>
	<section class="card flex flex-col gap-3 p-6"><p class="text-[18px] leading-7">{c.publicText}</p>{#if live}<p class="text-[14px] text-muted">Open until {closesOn(c.closesAt)}.</p>{/if}</section>
	<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Who can help</h2><div class="flex flex-wrap gap-2">{#each c.types as t}<span class="badge badge-soft !text-[15px]">{t}</span>{/each}</div></section>
	{#if live}
		<section class="card flex flex-col gap-4 p-6">
			<h2 class="text-lg font-bold">How you can help</h2>
			<ol class="flex flex-col gap-3 text-[15px] leading-[22px]">
				<li><b>1. Join as a donor.</b> It takes a few minutes, and you choose when to get alerts.</li>
				<li><b>2. Go to {c.facility.name}.</b> Staff will check you are eligible on the day.</li>
				<li><b>3. Give blood.</b> Your donation can save a life.</li>
			</ol>
			<div class="flex flex-col gap-3 sm:flex-row"><a href="/create-account" class="btn-primary sm:!w-auto sm:px-8">Become a donor</a><a href="/login" class="btn-secondary sm:!w-auto sm:px-8">Log in</a></div>
		</section>
		<section class="card flex flex-col gap-3 p-6"><h2 class="text-lg font-bold">Share this call</h2><p class="text-[14px] text-muted">Short link: <code class="rounded bg-rose-50 px-2 py-1">{link}</code></p><div class="flex flex-wrap gap-4 text-[15px]"><button type="button" onclick={copy} class="link">{copied ? 'Copied' : 'Copy link'}</button><a href="/calls/{c.code}/share" class="link">Poster and WhatsApp</a></div></section>
	{/if}
</main>
<PublicFooter />
