<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { todayNairobi } from '$lib/requests'
	import DriveForm from '$lib/ui/DriveForm.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import type { MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	let f = $state<MyFacilityView | null>(null)
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
		} catch {}
	})
	const initial = { host: '', venue: '', town: '', date: todayNairobi(), starts: '09:00', ends: '15:00', publicText: '', target: '', contactName: '', contactPhone: '' }
	async function save(body: Record<string, unknown>) {
		const r = await auth.call<{ id: string }>(`/my-facilities/${id}/drives`, { body })
		await goto(`/facility/${id}/drives/${r.id}/publish`)
	}
</script>

<svelte:head><title>New blood drive | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="drives">
	<header class="flex flex-col gap-1.5"><h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Create a blood drive</h1><p class="max-w-2xl text-base leading-6 text-muted">For a school, church, company or other host. They do not need an account. Your facility runs the drive and collects the blood.</p></header>
	{#if f}<DriveForm {initial} facility={f.name} link="{location.origin}/d/xxxxx" label="Save and continue" cancelHref="/facility/{id}/drives" {save} />{/if}
</FacilityShell>
