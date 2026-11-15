<script lang="ts">
	import { goto } from '$app/navigation'
	import { BRAND } from '$lib/brand'
	import { dayOf, longDay, monthOf } from '$lib/drives'
	import { plural } from '$lib/requests'
	import { driveHours } from '@damu/shared-types'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'

	let { data } = $props()
	// svelte-ignore state_referenced_locally
	let town = $state(data.town)
	const apply = (e: Event) => {
		e.preventDefault()
		void goto(`/drives${town.trim() ? `?town=${encodeURIComponent(town.trim())}` : ''}`)
	}
</script>

<svelte:head><title>Blood drives | {BRAND.name}</title><meta name="description" content="Blood drives at schools, churches and companies, run with a verified medical facility." /></svelte:head>

<PublicNav />
<main>
	<section class="bg-rose-600 text-white">
		<div class="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-14 md:py-16">
			<h1 class="text-[38px] font-extrabold leading-[44px] tracking-tight md:text-[52px] md:leading-[58px]">Blood drives</h1>
			<p class="max-w-2xl text-lg leading-7 text-white/90">Schools, churches, and companies host a drive with a nearby facility. Come along, or tell us you are interested.</p>
		</div>
	</section>
	<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
		<form onsubmit={apply} class="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
			<div class="flex flex-1 flex-col gap-2"><label for="town" class="field-label">Town</label><input id="town" bind:value={town} placeholder="Any town" class="field-input" /></div>
			<button class="btn-primary sm:!w-auto sm:px-8">Show drives</button>
		</form>
		<p class="text-[15px] text-muted" role="status">{data.failed ? 'Drives could not be loaded. Please try again.' : plural(data.items.length, 'upcoming drive')}</p>
		{#if data.items.length}
			<ul class="grid gap-5 md:grid-cols-2">
				{#each data.items as d}
					<li><a href="/drives/{d.code}" class="card flex items-center gap-5 p-5 hover:bg-rose-50">
						<span class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-rose-600 text-white"><span class="text-[12px] font-bold leading-4">{monthOf(d.date)}</span><span class="text-[26px] font-extrabold leading-7">{dayOf(d.date)}</span></span>
						<span class="min-w-0"><span class="block text-lg font-bold leading-6">{d.host} blood drive</span><span class="block text-[15px] text-muted">{longDay(d.date).split(' ')[0]}, {driveHours(d.starts, d.ends)}</span><span class="flex items-center gap-1 text-[15px] text-muted"><Icon name="pin" class="h-4 w-4" />{d.venue}, {d.town}</span><span class="block text-[13px] text-muted">Run by {d.facility.name}</span></span>
					</a></li>
				{/each}
			</ul>
		{:else if !data.failed}
			<div class="card p-10 text-center"><h2 class="text-xl font-bold">No upcoming drives</h2><p class="mt-2 text-muted">Check back soon, or try another town.</p></div>
		{/if}
		<section class="card flex flex-col gap-2 p-6 md:p-8"><h2 class="text-xl font-bold">Want to host a drive?</h2><p class="max-w-2xl text-[15px] leading-[22px] text-muted">Drives are set up by a verified medical facility on behalf of your school, church, or company. Contact your nearest medical facility, or ask them to join {BRAND.name}.</p></section>
	</div>
</main>
<PublicFooter />
