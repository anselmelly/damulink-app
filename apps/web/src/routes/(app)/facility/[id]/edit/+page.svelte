<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import FacilityForm from '$lib/ui/FacilityForm.svelte'
	import type { MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	let missing = $state(false)

	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
		} catch {
			missing = true
		}
	})

	async function save(input: Record<string, unknown>) {
		await auth.call(`/my-facilities/${id}`, { method: 'PUT', body: input })
		await auth.reload()
		await goto(`/facility/${id}`)
	}
</script>

<svelte:head><title>Correct your facility | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="status">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{f?.status === 'incomplete' ? 'Complete your facility profile' : 'Correct and submit again'}</h1>
		<p class="max-w-2xl text-base leading-6 text-muted">{f?.status === 'incomplete' ? 'A reviewer starts checking once this is done. You need to have verified your email first.' : 'Check the details the reviewer questioned, fix what was wrong, and send it again. Your facility code stays the same.'} Your facility code stays the same.</p>
	</header>
	{#if missing}
		<div class="notice-error"><p>We could not find this facility.</p></div>
	{:else if f}
		<FacilityForm save={save} cancelHref="/facility/{id}"  submitLabel={f.status === 'incomplete' ? 'Submit for verification' : 'Submit again'} initial={{ name: f.name, type: f.type, licenseNumber: f.licenseNumber ?? '', owner: f.owner ?? '', county: f.county, town: f.town, address: f.address ?? '', lat: f.lat == null ? '' : String(f.lat), lng: f.lng == null ? '' : String(f.lng), phone: f.phone ?? '', email: f.email ?? '' }} />
	{/if}
</FacilityShell>
