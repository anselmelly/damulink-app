<script lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { BRAND } from '$lib/brand'
	import { BLOOD_CHOICES, plural } from '$lib/requests'
	import CallCard from '$lib/ui/CallCard.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'

	let { data } = $props()
	let bloodType = $state(page.url.searchParams.get('bloodType') ?? '')
	let town = $state(page.url.searchParams.get('town') ?? '')
	let urgent = $state(page.url.searchParams.get('urgent') === '1')
	const apply = (e?: Event) => {
		e?.preventDefault()
		const q = new URLSearchParams()
		if (bloodType) q.set('bloodType', bloodType)
		if (town.trim()) q.set('town', town.trim())
		if (urgent) q.set('urgent', '1')
		void goto(`/calls${q.size ? `?${q}` : ''}`)
	}
</script>

<svelte:head><title>Open calls for blood | {BRAND.name}</title><meta name="description" content="Verified medical facilities that need blood donors right now." /></svelte:head>

<PublicNav />
<main>
	<section class="bg-rose-600 text-white">
		<div class="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-14 md:py-16">
			<h1 class="text-[38px] font-extrabold leading-[44px] tracking-tight md:text-[52px] md:leading-[58px]">Calls for blood</h1>
			<p class="max-w-2xl text-lg leading-7 text-white/90">Verified medical facilities asking for help right now. Share a call, or sign up to get alerts when your blood type is needed near you.</p>
		</div>
	</section>
	<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
		<form onsubmit={apply} class="card flex flex-col gap-4 p-5 md:flex-row md:items-end">
			<div class="flex flex-1 flex-col gap-2"><label for="fb" class="field-label">Blood type</label><select id="fb" bind:value={bloodType} onchange={() => apply()} class="field-input"><option value="">All types</option>{#each BLOOD_CHOICES as b}<option>{b}</option>{/each}</select></div>
			<div class="flex flex-1 flex-col gap-2"><label for="ft" class="field-label">Town</label><input id="ft" bind:value={town} placeholder="Any town" class="field-input" /></div>
			<label class="flex h-[52px] items-center gap-3 text-[15px] font-semibold"><input type="checkbox" bind:checked={urgent} onchange={() => apply()} class="peer sr-only" /><span class="switch"></span>Urgent only</label>
			<button class="btn-primary md:!w-auto md:px-8">Show calls</button>
		</form>
		<p class="text-[15px] text-muted" role="status">{data.failed ? 'Calls could not be loaded. Please try again.' : plural(data.items.length, 'open call')}</p>
		{#if data.items.length}
			<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{#each data.items as c}<CallCard {c} />{/each}</div>
		{:else if !data.failed}
			<div class="card p-10 text-center"><h2 class="text-xl font-bold">No open calls match</h2><p class="mt-2 text-muted">Try another blood type or town, or check back soon.</p></div>
		{/if}
	</div>
</main>
<PublicFooter />
