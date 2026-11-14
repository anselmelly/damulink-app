<script lang="ts">
	import { goto } from '$app/navigation'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import AccountShell from '$lib/ui/AccountShell.svelte'
	import FacilityForm from '$lib/ui/FacilityForm.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { MyFacilityView } from '@damu/shared-types'

	const user = $derived(auth.user!)

	async function save(input: Record<string, unknown>) {
		const f = await auth.call<MyFacilityView>('/facilities', { body: input })
		await auth.reload()
		await goto(`/facility/${f.id}?submitted=1`)
	}
</script>

<svelte:head><title>Add a facility | {BRAND.name}</title></svelte:head>

<AccountShell active="facility-new">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Add a facility</h1>
		<p class="max-w-2xl text-base leading-6 text-muted">Register a medical facility, health centre, or blood bank. A {BRAND.name} reviewer checks it by hand before it can post calls. You will become its admin and get a facility code.</p>
	</header>

	{#if !user.emailVerified}
		<div class="notice"><Icon name="mail" class="mt-px h-[22px] w-[22px] text-red-700" /><p>Verify your email first. We sent a link to <strong class="font-bold">{user.email}</strong>. <a href="/verify-email" class="link">Send it again</a></p></div>
	{:else}
		<div class="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
			<FacilityForm {save} />
			<aside class="flex flex-col gap-4 xl:sticky xl:top-8">
				<section class="card flex flex-col gap-4 p-6">
					<h2 class="text-lg font-bold">What happens next</h2>
					<ol class="flex flex-col gap-4">
						{#each [['Your facility is Pending', 'Nothing is published and no donors are contacted.'], ['We check it by hand', 'A reviewer may call the facility, or ask you a question.'], ['You are told by email', 'When it is verified you become its admin and can add attendants.']] as [t, d], i}
							<li class="flex items-start gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-extrabold text-red-700">{i + 1}</span><span class="text-[15px] leading-[22px]"><strong class="block font-bold">{t}</strong>{d}</span></li>
						{/each}
					</ol>
				</section>
			</aside>
		</div>
	{/if}
</AccountShell>
