<script lang="ts">
	import type { Snippet } from 'svelte'
	import { BRAND } from '$lib/brand'
	import Icon from './Icon.svelte'
	import Logo from './Logo.svelte'

	let {
		children,
		brandTitle = 'Reach the right donors, fast.',
		brandText = `${BRAND.name} connects verified medical facilities, donors, and families so a call for blood gets answered in minutes.`,
		brandPoints = ['Only verified medical facilities can post requests', 'Alerts go only to donors who opted in', 'Patient details are never shown publicly'],
		inner = 'max-w-[400px]',
	}: { children: Snippet; brandTitle?: string; brandText?: string; brandPoints?: string[]; inner?: string } = $props()
</script>

<div class="flex min-h-screen flex-col md:flex-row">
	<aside class="relative overflow-hidden bg-rose-600 px-6 pb-14 pt-8 text-white md:sticky md:top-0 md:flex md:h-screen md:w-1/2 md:shrink-0 md:flex-col md:items-center md:justify-center md:gap-12 md:p-16">
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="#fff" class="pointer-events-none absolute -right-[52px] -top-[30px] h-[260px] w-[215px] opacity-[0.12] md:-bottom-36 md:-right-28 md:top-auto md:h-[620px] md:w-[520px] md:opacity-10"><path d="M12 2.6c-3.9 4.7-6.4 8.2-6.4 11.3a6.4 6.4 0 0 0 12.8 0c0-3.1-2.5-6.6-6.4-11.3z" /></svg>
		<a href="/" class="relative -ml-2 inline-flex rounded-lg md:absolute md:left-1/2 md:top-12 md:-translate-x-1/2 text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"><Logo /></a>
		<div class="relative hidden w-full max-w-[480px] flex-col gap-5 md:flex">
			<h2 class="text-[46px] font-extrabold leading-[52px] tracking-tight">{brandTitle}</h2>
			<p class="text-lg leading-7">{brandText}</p>
			<ul class="mt-3 flex flex-col gap-3.5 text-[17px] leading-6">
				{#each brandPoints as p}
					<li class="flex items-center gap-3"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-rose-600"><Icon name="check" class="h-4 w-4" /></span>{p}</li>
				{/each}
			</ul>
		</div>
	</aside>

	<main class="-mt-7 flex flex-1 flex-col items-center justify-center rounded-t-[28px] bg-white px-6 pb-8 pt-8 md:mt-0 md:rounded-none md:px-10 md:py-12">
		<div class="flex w-full flex-col {inner}">
			{@render children()}
		</div>
	</main>
</div>
