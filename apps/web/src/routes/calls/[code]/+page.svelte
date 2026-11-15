<script lang="ts">
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { closesOn, shortLink, urgencyLabel } from '$lib/calls'
	import { sentAt } from '$lib/requests'
	import BloodChip from '$lib/ui/BloodChip.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import Logo from '$lib/ui/Logo.svelte'
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
<main class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<a href="/calls" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />All calls</a>
	{#if !live}<div class="notice" role="status"><Icon name="info" class="mt-px h-5 w-5 shrink-0" /><p><strong class="font-bold">This call is closed.</strong> The facility has the blood it needed. Thank you to everyone who shared it. <a href="/calls" class="link">See open calls</a></p></div>{/if}
	<div class="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
		<div class="flex flex-col gap-6">
			<section class="card flex flex-col gap-5 p-6 md:p-8">
				<p class="flex flex-wrap items-center gap-3 text-[13px] text-muted">{#if live}{#if c.urgency !== 'normal'}<span class="badge badge-urgent">{urgencyLabel(c.urgency)}</span>{:else}<span class="badge badge-soft">Normal</span>{/if}{:else}<span class="badge badge-neutral">Closed</span>{/if}<span>Posted {sentAt(c.publishedAt)} · Call {c.code}</span></p>
				<div class="flex items-center gap-5">
					<span class="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-[40px] font-extrabold leading-none text-rose-600" aria-label="Blood type {c.bloodType}">{c.bloodType}</span>
					<div class="flex flex-col gap-2"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Blood needed</h1><p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted"><span class="flex items-center gap-1"><Icon name="pin" class="h-5 w-5" />{c.facility.name}, {c.facility.town}</span><span class="badge badge-ok"><Icon name="shield" class="h-4 w-4" />Verified medical facility</span></p></div>
				</div>
				<p class="rounded-xl bg-rose-50 px-5 py-4 text-lg leading-7">{c.publicText}</p>
				{#if live}<p class="flex items-center gap-2 text-[15px] text-muted"><Icon name="clock" class="h-5 w-5" />Open until {closesOn(c.closesAt)}</p>{/if}
			</section>
			<section class="card flex flex-col gap-4 p-6 md:p-8"><h2 class="text-xl font-bold">Who can help</h2><p class="text-[15px] leading-[22px] text-muted">This facility accepts blood from these types. The facility checks you on the day and has the final say.</p><div class="flex flex-wrap gap-2">{#each c.types as t}<span class="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-600 text-lg font-extrabold text-white">{t}</span>{/each}</div></section>
			{#if live}
				<section class="card flex flex-col gap-5 p-6 md:p-8">
					<h2 class="text-xl font-bold">How you can help</h2>
					<ol class="flex flex-col gap-4 text-[15px] leading-[22px]">
						<li class="flex gap-4"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 font-bold text-red-700">1</span><span><b>Share this call.</b> One message to a family group can reach the right person.</span></li>
						<li class="flex gap-4"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 font-bold text-red-700">2</span><span><b>Already a donor?</b> If you got our SMS, reply YES and the facility will call you.</span></li>
						<li class="flex gap-4"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 font-bold text-red-700">3</span><span><b>New here?</b> Join {BRAND.name} to be matched to calls like this one, and texted only when it fits you.</span></li>
					</ol>
					{#if auth.user}<a href="/calls-for-you" class="btn-primary">Calls for you</a>{:else}<div class="grid gap-3 sm:grid-cols-2"><a href="/create-account" class="btn-primary">Become a donor</a><a href="/login" class="btn-secondary">Log in</a></div>{/if}
				</section>
			{/if}
		</div>
		{#if live}
			<aside class="flex flex-col gap-3 lg:sticky lg:top-6">
				<div class="relative overflow-hidden rounded-3xl bg-rose-600 p-6 text-white shadow-lg">
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="#fff" class="pointer-events-none absolute -right-12 top-16 h-[330px] w-[270px] opacity-[.16]"><path d="M12 2.6c-3.9 4.7-6.4 8.2-6.4 11.3a6.4 6.4 0 0 0 12.8 0c0-3.1-2.5-6.6-6.4-11.3z" /></svg>
					<div class="relative flex items-center justify-between"><Logo class="h-8" />{#if c.urgency !== 'normal'}<span class="rounded-full bg-white px-4 py-1 text-[13px] font-extrabold uppercase tracking-widest text-red-700">{urgencyLabel(c.urgency)}</span>{/if}</div>
					<p class="relative mt-2 text-[88px] font-extrabold leading-none">{c.bloodType}</p>
					<p class="relative mt-5 text-[28px] font-extrabold leading-8">Blood needed</p>
					<p class="relative mt-3 text-lg font-bold">{c.facility.name}, {c.facility.town}</p>
					<p class="relative mt-2 text-[15px] leading-5 text-white/90">{c.publicText}</p>
					<div class="relative mt-4 rounded-2xl bg-white px-4 py-4 text-center text-ink"><p class="text-[15px] font-semibold">Can you help? Please share, or open</p><p class="text-[26px] font-extrabold text-red-700">{link.replace(/^https?:\/\//, '')}</p></div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<button type="button" onclick={copy} class="btn-secondary flex items-center justify-center gap-2"><Icon name="copy" class="h-5 w-5" />{copied ? 'Copied' : 'Copy link'}</button>
					<a href="/calls/{c.code}/share" class="btn-primary flex items-center justify-center gap-2"><Icon name="share" class="h-5 w-5" />Share</a>
				</div>
				<p class="text-center text-[13px] text-muted">{link.replace(/^https?:\/\//, '')}</p>
			</aside>
		{/if}
	</div>
</main>
<PublicFooter />
