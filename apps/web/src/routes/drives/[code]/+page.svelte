<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { dayOf, longDay, monthOf } from '$lib/drives'
	import { driveHours, type PublicDrive } from '@damu/shared-types'
	import DrivePoster from '$lib/ui/DrivePoster.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'

	let { data } = $props()
	let mine = $state<PublicDrive | null>(null) // the same drive as a signed-in donor sees it (are they on the list)
	const d = $derived(mine ?? data.drive)
	const joined = $derived(d.interested || page.url.searchParams.get('done') === '1')
	let copied = $state(false)
	onMount(async () => {
		await auth.init?.()
		if (auth.user) mine = await auth.call<PublicDrive>(`/public/drives/${encodeURIComponent(data.drive.code)}`).catch(() => null)
	})
	async function copy() {
		await navigator.clipboard?.writeText(d.link).catch(() => {})
		copied = true
		setTimeout(() => (copied = false), 2000)
	}
	const full = $derived(new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
</script>

<svelte:head>
	<title>{d.host} blood drive | {BRAND.name}</title>
	<meta name="description" content={d.text} />
	<meta property="og:title" content="{d.host} blood drive, {d.town}" />
	<meta property="og:description" content={d.text} />
</svelte:head>

<PublicNav />
<main class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<a href="/drives" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />All drives</a>
	{#if joined && d.state === 'open'}<div class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-emerald-700" /><p><strong class="font-bold">You are on the list.</strong> The facility will plan for you. Come along on the day.</p></div>{/if}
	{#if d.state === 'ended'}<div class="notice" role="status"><Icon name="info" class="mt-px h-5 w-5 shrink-0" /><p><strong class="font-bold">This drive has ended.</strong> Thank you to everyone who came. <a href="/drives" class="link">See upcoming drives</a></p></div>{/if}
	{#if d.state === 'cancelled'}<div class="notice-error" role="alert"><Icon name="alert" class="mt-px h-5 w-5 shrink-0 text-red-700" /><p><strong class="font-bold">This drive was cancelled.</strong> Sorry about that. <a href="/drives" class="link">See upcoming drives</a></p></div>{/if}
	<div class="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
		<div class="flex flex-col gap-6">
			<section class="card flex flex-col gap-5 p-6 md:p-8">
				<div class="flex items-start gap-5">
					<span class="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-2xl bg-rose-600 text-white"><span class="text-[13px] font-bold">{monthOf(d.date)}</span><span class="text-[40px] font-extrabold leading-10">{dayOf(d.date)}</span></span>
					<div class="flex flex-col gap-2"><span class="badge badge-soft self-start">Blood drive</span><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{d.host} blood drive</h1></div>
				</div>
				<dl class="grid divide-rose-200 rounded-xl border border-rose-200 sm:grid-cols-2 sm:[&>div:nth-child(odd)]:border-r [&>div:nth-child(n+3)]:border-t [&>div]:border-rose-200">
					<div class="p-4"><dt class="flex items-center gap-2 text-[13px] text-muted"><Icon name="calendar" class="h-4 w-4" />Date</dt><dd class="text-lg font-bold">{full}</dd></div>
					<div class="p-4"><dt class="flex items-center gap-2 text-[13px] text-muted"><Icon name="clock" class="h-4 w-4" />Time</dt><dd class="text-lg font-bold">{driveHours(d.starts, d.ends)}</dd></div>
					<div class="p-4"><dt class="flex items-center gap-2 text-[13px] text-muted"><Icon name="pin" class="h-4 w-4" />Venue</dt><dd class="text-lg font-bold">{d.venue}, {d.town}</dd></div>
					<div class="p-4"><dt class="flex items-center gap-2 text-[13px] text-muted"><Icon name="building" class="h-4 w-4" />Run by</dt><dd class="flex flex-wrap items-center gap-2 text-lg font-bold">{d.facility.name}<span class="badge badge-ok text-[12px]"><Icon name="shield" class="h-3.5 w-3.5" />Verified</span></dd></div>
				</dl>
				<p class="text-base leading-6">Hosted by {d.host} together with {d.facility.name}. Attendants from the facility will screen and collect blood on site. {d.text}</p>
			</section>
			<section class="card flex flex-col gap-4 p-6 md:p-8"><h2 class="text-xl font-bold">Before you come</h2>
				<ul class="flex flex-col gap-3 text-[15px] leading-[22px]">{#each ['Eat a good meal and drink water first.', "Donors are usually 18 to 65 and at least 50 kg. The facility's own screening on the day has the final say.", `Have a ${BRAND.name} donor code? Bring it. No account? You can still donate, attendants will record you.`] as t}<li class="flex gap-3"><Icon name="check" class="mt-0.5 h-5 w-5 shrink-0 text-red-700" />{t}</li>{/each}</ul>
			</section>
			<section class="flex flex-col gap-4 rounded-3xl bg-rose-600 p-6 text-white md:flex-row md:items-center md:justify-between md:p-8"><div><h2 class="text-xl font-extrabold">Make your donation count beyond the drive</h2><p class="mt-2 max-w-xl text-white/90">Register on {BRAND.name} and medical facilities can reach you when your blood type is urgently needed, only when you opt in. You choose when to get alerts.</p></div><a href="/create-account" class="btn-light shrink-0">Become a donor</a></section>
		</div>
		<aside class="flex flex-col gap-4 lg:sticky lg:top-24">
			{#if d.state === 'open' && !joined}
				<section class="card flex flex-col gap-3 p-6"><h2 class="text-xl font-bold">Planning to come?</h2><p class="text-[15px] leading-[22px] text-muted">Tell the facility you are interested so they can plan. It is optional, and you can still walk in.</p><a href="/drives/{d.code}/interested" class="btn-primary">I am interested in donating</a><a href="/login" class="link text-center text-[15px]">I have a {BRAND.name} account</a></section>
			{/if}
			<DrivePoster host={d.host} venue={d.venue} town={d.town} facility={d.facility.name} date={d.date} starts={d.starts} ends={d.ends} link={d.link} />
			<div class="grid grid-cols-2 gap-3"><button type="button" onclick={copy} class="btn-secondary flex items-center justify-center gap-2"><Icon name="copy" class="h-5 w-5" />{copied ? 'Copied' : 'Copy link'}</button><a href="https://wa.me/?text={encodeURIComponent(`Blood drive: ${d.host}, ${d.town}. ${d.link}`)}" target="_blank" rel="noopener" class="btn-primary flex items-center justify-center gap-2"><Icon name="share" class="h-5 w-5" />Share</a></div>
		</aside>
	</div>
</main>
<PublicFooter />
