<script lang="ts">
	import BloodChip from './BloodChip.svelte'
	import Icon from './Icon.svelte'
	import { urgencyLabel } from '$lib/calls'
	import { ago } from '$lib/requests'
	import type { PublicCall } from '@damu/shared-types'

	let { c }: { c: PublicCall } = $props()
	/** "3 hours ago", "Yesterday", "2 days ago". */
	const since = (iso: string) => {
		const t = ago(iso)
		return t === 'Yesterday' || t.endsWith('ago') ? t : `${t} ago`
	}
</script>

<article class="card flex flex-col gap-3 p-5">
	<div class="flex items-center justify-between gap-3">
		{#if c.urgency !== 'normal'}<span class="badge badge-urgent">{urgencyLabel(c.urgency)}</span>{:else}<span class="badge badge-soft">Open call</span>{/if}
		<span class="text-[13px] text-muted">{since(c.publishedAt)}</span>
	</div>
	<div class="flex items-center gap-3"><BloodChip type={c.bloodType} /><div class="min-w-0"><p class="truncate font-bold">{c.facility.name}</p><p class="flex items-center gap-1 text-[14px] text-muted"><Icon name="pin" class="h-4 w-4" />{c.facility.town}</p></div></div>
	<p class="text-[15px] leading-[22px]">{c.publicText}</p>
	<a href="/calls/{c.code}" class="btn-secondary !h-11 self-start sm:!w-auto sm:px-6">Details</a>
</article>
