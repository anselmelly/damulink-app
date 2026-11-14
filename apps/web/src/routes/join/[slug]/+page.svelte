<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { apiFetch } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'
	import type { PublicFacility } from '@damu/shared-types'

	let f = $state<PublicFacility | null>(null)
	let invalid = $state(false)
	let loaded = $state(false)
	onMount(async () => {
		try {
			f = await apiFetch<PublicFacility>(`/facilities/by-slug/${page.params.slug}`)
		} catch {
			invalid = true
		}
		loaded = true
	})
</script>

<svelte:head><title>{f ? `Join ${f.name} on ${BRAND.name}` : `Join ${BRAND.name}`}</title></svelte:head>

<PublicNav />
<main>
	<section class="relative overflow-hidden bg-rose-600 text-white">
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="#fff" class="pointer-events-none absolute -bottom-32 -right-20 h-[560px] w-[460px] opacity-[0.1]"><path d="M12 2.6c-3.9 4.7-6.4 8.2-6.4 11.3a6.4 6.4 0 0 0 12.8 0c0-3.1-2.5-6.6-6.4-11.3z" /></svg>
		<div class="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 md:py-20 lg:grid-cols-[1.1fr_.9fr]">
			{#if !loaded}
				<p role="status">Loading…</p>
			{:else if f}
				<div class="flex flex-col gap-6">
					<span class="badge self-start bg-white text-red-700">Verified medical facility</span>
					<h1 class="text-[36px] font-extrabold leading-[42px] tracking-tight md:text-[52px] md:leading-[58px]">{f.name} invites you to be a donor</h1>
					<p class="max-w-xl text-lg leading-7">Join {BRAND.name} and this facility can reach you first when your blood type is needed. You choose when to get alerts, and you can stop at any time.</p>
					<div class="flex flex-col gap-3 sm:flex-row">
						<a href="/create-account?facility={f.id}" class="btn-light sm:min-w-[220px]">Join as a donor</a>
						<a href="/login" class="flex h-[52px] items-center justify-center rounded-xl border-[1.5px] border-white/70 px-6 text-base font-bold text-white hover:bg-white/10">I already have an account</a>
					</div>
				</div>
				<div class="card flex flex-col gap-5 p-6 text-ink md:p-8">
					<div class="flex items-start gap-4"><span class="path-icon h-14 w-14"><Icon name="building" class="h-7 w-7" /></span><div><p class="text-xl font-extrabold leading-7">{f.name}</p><p class="flex items-center gap-1.5 text-[15px] text-muted"><Icon name="pin" class="h-4 w-4" />{f.town}</p></div></div>
					<p class="rounded-xl bg-rose-50 p-4 text-[15px] leading-[22px]">When you join from this link, <strong class="font-bold">{f.name}</strong> is already chosen as your home facility.</p>
					<ol class="flex flex-col gap-4">
						{#each ['Create your account and verify your phone', 'Visit the facility for a blood type test or your first donation', 'Once your blood type is recorded, you can get alerts'] as t, i}
							<li class="flex items-start gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700">{i + 1}</span><p class="pt-1 text-[15px] leading-[22px]">{t}</p></li>
						{/each}
					</ol>
					<p class="text-[13px] leading-[18px] text-muted">The facility does not register or message anyone on your behalf. You join by choice.</p>
				</div>
			{:else}
				<div class="flex flex-col gap-6">
					<span class="flex h-16 w-16 items-center justify-center rounded-full bg-white text-rose-600"><Icon name="alert" class="h-8 w-8" /></span>
					<h1 class="text-[36px] font-extrabold leading-[42px] tracking-tight md:text-[48px] md:leading-[54px]">This invite link is not valid</h1>
					<p class="max-w-xl text-lg leading-7">The link may have been typed wrong, or the facility turned it off. You can still join and pick your facility yourself.</p>
					<div><a href="/create-account" class="btn-light sm:inline-flex">Join as a donor</a></div>
				</div>
			{/if}
		</div>
	</section>
</main>
<PublicFooter />
