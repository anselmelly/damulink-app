<script lang="ts">
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { urgencyLabel } from '$lib/calls'
	import { ago } from '$lib/requests'
	import { dayOf, longDay, monthOf } from '$lib/drives'
	import { driveHours } from '@damu/shared-types'
	import CallCard from '$lib/ui/CallCard.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'

	let { data } = $props()
	const first = $derived(data.calls[0])
	const since = (iso: string) => {
		const t = ago(iso)
		return t === 'Yesterday' || t.endsWith('ago') ? t : `${t} ago`
	}
	const steps = [
		{ icon: 'building', title: 'A hospital asks for blood', text: 'A verified medical facility confirms the patient and the blood type, then raises a call. Families can ask on a patient’s behalf, but only the facility publishes.' },
		{ icon: 'message', title: 'The right donors get a text', text: 'We message donors who opted in and match the blood type, starting with those closest to that hospital. The text never mentions the patient.' },
		{ icon: 'calendar', title: 'You say YES, they schedule you', text: 'Reply YES, or tap it in your account. The hospital gets your number only then, books a time, and screens you on the day.' },
	]
	const trust = [
		{ icon: 'shield', title: 'Facilities are checked by hand', text: 'A reviewer verifies every medical facility before it can post a call or alert a donor.' },
		{ icon: 'lock', title: 'Patient details stay private', text: 'Public pages and messages show a blood type, a facility and a short note. Never a patient name.' },
		{ icon: 'bell', title: 'You control the alerts', text: 'Pick SMS, email or both, set quiet hours, and reply STOP any time.' },
	]
</script>

<svelte:head>
	<title>{BRAND.name}: reach the right donors, fast</title>
	<meta name="description" content="{BRAND.name} connects verified medical facilities, donors, and families so a call for blood reaches the right donors fast." />
</svelte:head>

<PublicNav />

<main>
	<section class="relative overflow-hidden bg-rose-600 text-white">
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="#fff" class="pointer-events-none absolute -bottom-32 -right-20 h-[560px] w-[460px] opacity-[0.1]"><path d="M12 2.6c-3.9 4.7-6.4 8.2-6.4 11.3a6.4 6.4 0 0 0 12.8 0c0-3.1-2.5-6.6-6.4-11.3z" /></svg>
		<div class="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 md:py-20 lg:grid-cols-[1.1fr_.9fr]">
			<div class="flex flex-col gap-6">
				<h1 class="text-[38px] font-extrabold leading-[44px] tracking-tight md:text-[56px] md:leading-[62px]">When someone needs blood, the right donors hear first.</h1>
				<p class="max-w-xl text-lg leading-7 md:text-xl md:leading-8">{BRAND.name} connects verified medical facilities, donors, and families. Medical facilities raise a call, matching donors nearby get an SMS, and you reply YES if you can come.</p>
				<div class="flex flex-col gap-3 sm:flex-row">
					<a href={auth.user ? '/dashboard' : '/create-account'} class="btn-light sm:min-w-[210px]">{auth.user ? 'Go to my account' : 'Become a donor'}</a>
					<a href={auth.user ? '/request' : '/create-account'} class="flex h-[52px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-white/70 px-6 text-base font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300">Request blood for someone</a>
				</div>
				<p class="flex items-center gap-2 text-sm"><Icon name="shield" class="h-5 w-5" />Only verified medical facilities can post. Patient details are never shown publicly.</p>
			</div>
			{#if first}
				<div class="flex flex-col gap-5 rounded-3xl bg-white p-6 text-ink shadow-2xl shadow-rose-900/30 md:p-8">
					<div class="flex items-center justify-between gap-3"><span class="badge {first.urgency !== 'normal' ? 'badge-urgent' : 'badge-soft'}">{first.urgency !== 'normal' ? urgencyLabel(first.urgency) : 'Normal'}</span><span class="text-[13px] text-muted">Posted {since(first.publishedAt)}</span></div>
					<div class="flex items-center gap-5">
						<span class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-[34px] font-extrabold leading-none text-rose-600">{first.bloodType}</span>
						<div><p class="text-2xl font-extrabold leading-8">Blood needed</p><p class="flex items-center gap-1 text-[15px] text-muted"><Icon name="pin" class="h-4 w-4" />{first.facility.name}, {first.facility.town}</p></div>
					</div>
					<p class="text-[15px] leading-[22px]">{first.publicText}</p>
					<div class="grid grid-cols-2 gap-3"><a href="/calls/{first.code}/share" class="btn-primary flex items-center justify-center gap-2"><Icon name="share" class="h-5 w-5" />Share</a><a href="/calls/{first.code}" class="btn-secondary">View call</a></div>
				</div>
			{:else}
				<div class="rounded-3xl bg-white p-6 text-ink shadow-2xl shadow-rose-900/30 md:p-8">
					<p class="eyebrow">How a call works</p>
					<ol class="mt-4 flex flex-col gap-4">
						{#each steps as s, i}
							<li class="flex items-start gap-4"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700">{i + 1}</span><span class="text-[15px] leading-[22px]">{s.title}</span></li>
						{/each}
					</ol>
				</div>
			{/if}
		</div>
	</section>

	<section id="how" class="scroll-mt-20 bg-white py-16 md:py-24">
		<div class="mx-auto max-w-6xl px-6">
			<p class="eyebrow">How it works</p>
			<h2 class="mt-2 max-w-2xl text-[30px] font-extrabold leading-9 tracking-tight md:text-[40px] md:leading-[46px]">From a hospital bed to a donor on the way</h2>
			<p class="mt-3 max-w-2xl text-base leading-6 text-muted">A call for blood takes minutes, not a night of phone calls.</p>
			<ol class="mt-10 grid gap-5 md:grid-cols-3">
				{#each steps as s}
					<li class="card flex flex-col gap-4 p-6">
						<span class="path-icon"><Icon name={s.icon} class="h-[26px] w-[26px]" /></span>
						<h3 class="text-xl font-bold leading-7">{s.title}</h3>
						<p class="text-[15px] leading-[22px] text-muted">{s.text}</p>
					</li>
				{/each}
			</ol>
			<p class="mt-6 text-[15px] text-muted">The facility’s screening on the day has the final say on every donation.</p>
		</div>
	</section>

	{#if data.calls.length}
		<section class="bg-rose-50 py-16 md:py-24">
			<div class="mx-auto max-w-6xl px-6">
				<div class="flex items-end justify-between gap-4"><div><p class="eyebrow">Calls for blood</p><h2 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight md:text-[40px] md:leading-[46px]">Open right now</h2></div><a href="/calls" class="link flex items-center gap-1 text-[15px]">See all calls<Icon name="arrow" class="h-5 w-5" /></a></div>
				<div class="mt-8 grid gap-5 md:grid-cols-3">{#each data.calls as c}<CallCard {c} home />{/each}</div>
			</div>
		</section>
	{/if}


	{#if data.drives.length}
		<section class="bg-white py-16 md:py-24">
			<div class="mx-auto max-w-6xl px-6">
				<div class="flex items-end justify-between gap-4"><div><p class="eyebrow">Blood drives</p><h2 class="mt-2 text-[30px] font-extrabold leading-9 tracking-tight md:text-[40px] md:leading-[46px]">Donate with your school, church, or company</h2></div><a href="/drives" class="link flex shrink-0 items-center gap-1 text-[15px]">See all drives<Icon name="arrow" class="h-5 w-5" /></a></div>
				<ul class="mt-8 grid gap-5 md:grid-cols-2">
					{#each data.drives as d}
						<li><a href="/drives/{d.code}" class="card flex items-center gap-5 p-5 hover:bg-rose-50"><span class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-rose-600 text-white"><span class="text-[12px] font-bold leading-4">{monthOf(d.date)}</span><span class="text-[26px] font-extrabold leading-7">{dayOf(d.date)}</span></span><span class="min-w-0"><span class="block text-lg font-bold leading-6">{d.host} blood drive</span><span class="block text-[15px] text-muted">{longDay(d.date).split(' ')[0]}, {driveHours(d.starts, d.ends)} · {d.venue}, {d.town}</span><span class="block text-[13px] text-muted">Run by {d.facility.name}</span></span></a></li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}

	<section id="facilities" class="scroll-mt-20 bg-rose-600 py-16 text-white md:py-20">
		<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
			<div>
				<h2 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[40px] md:leading-[46px]">Run a medical facility or blood bank?</h2>
				<p class="mt-3 max-w-2xl text-lg leading-7">Add your facility. After a quick manual check, you can publish calls, alert nearby donors, and schedule the ones who say YES.</p>
			</div>
			<a href="/register-facility" class="btn-light shrink-0">Add your facility</a>
		</div>
	</section>

	<section class="bg-white py-16 md:py-20">
		<div class="mx-auto max-w-6xl px-6">
			<p class="eyebrow">Built on trust</p>
			<ul class="mt-6 grid gap-8 md:grid-cols-3">
				{#each trust as t}
					<li class="flex items-start gap-4"><span class="path-icon"><Icon name={t.icon} class="h-[26px] w-[26px]" /></span><div><h3 class="text-xl font-bold leading-7">{t.title}</h3><p class="mt-1 text-[15px] leading-[22px] text-muted">{t.text}</p></div></li>
				{/each}
			</ul>
		</div>
	</section>

	<section class="relative overflow-hidden bg-rose-600 py-16 text-white md:py-24">
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="#fff" class="pointer-events-none absolute -bottom-24 right-10 h-[520px] w-[420px] opacity-[0.1]"><path d="M12 2.6c-3.9 4.7-6.4 8.2-6.4 11.3a6.4 6.4 0 0 0 12.8 0c0-3.1-2.5-6.6-6.4-11.3z" /></svg>
		<div class="relative mx-auto flex max-w-6xl flex-col gap-8 px-6">
			<h2 class="text-[44px] font-extrabold leading-[50px] tracking-tight md:text-[72px] md:leading-[78px]">{BRAND.slogan}</h2>
			<div class="flex flex-col gap-3 sm:flex-row"><a href={auth.user ? '/dashboard' : '/create-account'} class="btn-light sm:min-w-[210px]">{auth.user ? 'Go to my account' : 'Become a donor'}</a><a href={auth.user ? '/request' : '/create-account'} class="flex h-[52px] items-center justify-center rounded-xl border-[1.5px] border-white/70 px-6 text-base font-bold text-white hover:bg-white/10">Request blood for someone</a></div>
		</div>
	</section>
</main>

<PublicFooter />
