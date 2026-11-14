<script lang="ts">
	import { BRAND } from '$lib/brand'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'

	const steps = [
		{ icon: 'building', title: 'A verified medical facility raises a call', text: 'Families can ask on a patient’s behalf. The facility confirms the admission and the blood type before anything is shared.' },
		{ icon: 'message', title: 'Matching donors get an SMS', text: 'Only donors who opted in, whose blood type fits and who are likely eligible today, starting from the facility’s own donors.' },
		{ icon: 'calendar', title: 'You reply YES, the facility schedules you', text: 'Your number goes to the facility only after you say YES. Their screening on the day has the final say.' },
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
					<a href="/create-account" class="btn-light sm:min-w-[210px]">Become a donor</a>
					<a href="/create-account" class="flex h-[52px] items-center justify-center gap-2 rounded-xl border-[1.5px] border-white/70 px-6 text-base font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300">Request blood for someone</a>
				</div>
				<p class="flex items-center gap-2 text-sm"><Icon name="shield" class="h-5 w-5" />Only verified medical facilities can post. Patient details are never shown publicly.</p>
			</div>
			<div class="rounded-3xl bg-white p-6 text-ink shadow-2xl shadow-rose-900/30 md:p-8">
				<p class="eyebrow">How a call works</p>
				<ol class="mt-4 flex flex-col gap-4">
					{#each steps as s, i}
						<li class="flex items-start gap-4"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700">{i + 1}</span><span class="text-[15px] leading-[22px]">{s.title}</span></li>
					{/each}
				</ol>
			</div>
		</div>
	</section>

	<section id="how" class="scroll-mt-20 bg-white py-16 md:py-24">
		<div class="mx-auto max-w-6xl px-6">
			<p class="eyebrow">How it works</p>
			<h2 class="mt-2 max-w-2xl text-[30px] font-extrabold leading-9 tracking-tight md:text-[40px] md:leading-[46px]">From a patient's bed to a donor on the way</h2>
			<ol class="mt-10 grid gap-5 md:grid-cols-3">
				{#each steps as s}
					<li class="card flex flex-col gap-4 p-6">
						<span class="path-icon"><Icon name={s.icon} class="h-[26px] w-[26px]" /></span>
						<h3 class="text-xl font-bold leading-7">{s.title}</h3>
						<p class="text-[15px] leading-[22px] text-muted">{s.text}</p>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<section class="bg-rose-50 py-16 md:py-24">
		<div class="mx-auto max-w-6xl px-6">
			<p class="eyebrow">Built on trust</p>
			<h2 class="mt-2 max-w-2xl text-[30px] font-extrabold leading-9 tracking-tight md:text-[40px] md:leading-[46px]">Private, checked, and in your control</h2>
			<ul class="mt-10 grid gap-5 md:grid-cols-3">
				{#each trust as t}
					<li class="card flex flex-col gap-4 p-6">
						<span class="path-icon"><Icon name={t.icon} class="h-[26px] w-[26px]" /></span>
						<h3 class="text-xl font-bold leading-7">{t.title}</h3>
						<p class="text-[15px] leading-[22px] text-muted">{t.text}</p>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<section id="facilities" class="scroll-mt-20 bg-rose-600 py-16 text-white md:py-20">
		<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
			<div>
				<h2 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[40px] md:leading-[46px]">Run a medical facility or blood bank?</h2>
				<p class="mt-3 max-w-2xl text-lg leading-7">Add your facility. After a quick manual check, you can publish calls, alert nearby donors, and schedule the ones who say YES.</p>
			</div>
			<a href="/create-account" class="btn-light shrink-0">Add your facility</a>
		</div>
	</section>

	<section class="bg-white py-16 text-center md:py-24">
		<h2 class="mx-auto max-w-4xl px-6 text-[40px] font-extrabold leading-[46px] tracking-tight md:text-[64px] md:leading-[70px]">{BRAND.slogan}</h2>
		<a href="/create-account" class="btn-primary mx-auto mt-8 !w-auto px-8">Create an account</a>
	</section>
</main>

<PublicFooter />
