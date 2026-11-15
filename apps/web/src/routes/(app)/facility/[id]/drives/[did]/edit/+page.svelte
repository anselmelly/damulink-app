<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import DriveForm from '$lib/ui/DriveForm.svelte'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import type { DriveDetail, MyFacilityView } from '@damu/shared-types'

	const id = $derived(page.params.id)
	const did = $derived(page.params.did)
	let f = $state<MyFacilityView | null>(null)
	let d = $state<DriveDetail | null>(null)
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			d = await auth.call<DriveDetail>(`/my-facilities/${id}/drives/${did}`)
		} catch {}
	})
	async function save(body: Record<string, unknown>) {
		await auth.call(`/my-facilities/${id}/drives/${did}`, { method: 'PATCH', body })
		await goto(`/facility/${id}/drives/${did}`)
	}
</script>

<svelte:head><title>Edit blood drive | {BRAND.name}</title></svelte:head>

<FacilityShell {f} active="drives">
	<a href="/facility/{id}/drives/{did}" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Back to the drive</a>
	<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">Edit the drive</h1>
	{#if d && f}
		<DriveForm initial={{ host: d.host, venue: d.venue, town: d.town, date: d.date, starts: d.starts, ends: d.ends, publicText: d.publicText, target: d.target ? String(d.target) : '', contactName: d.contactName ?? '', contactPhone: d.contactPhone ?? '' }} facility={f.name} link="{location.origin}/d/{d.short}" label="Save changes" cancelHref="/facility/{id}/drives/{did}" {save} />
	{/if}
</FacilityShell>
