<script lang="ts">
	import Icon from './Icon.svelte'
	import { urgencyLabel } from '$lib/calls'
	import { ago } from '$lib/requests'
	import type { PublicCall } from '@damu/shared-types'

	let { c, home = false }: { c: PublicCall; home?: boolean } = $props()
	/** "3 hours ago", "Yesterday", "2 days ago". */
	const since = (iso: string) => {
		const t = ago(iso)
		return t === 'Yesterday' || t.endsWith('ago') ? t : `${t} ago`
	}
</script>

<article class="card flex flex-col gap-4 p-5">
	<div class="flex items-center justify-between gap-3">
		<span class="badge {c.urgency !== 'normal' ? 'badge-urgent' : 'badge-soft'}">{c.urgency !== 'normal' ? urgencyLabel(c.urgency) : 'Normal'}</span>
		<span class="text-[13px] text-muted">{since(c.publishedAt)}</span>
	</div>
	<div class="flex items-center gap-4">
		<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-[28px] font-extrabold leading-none text-rose-600" aria-label="Blood type {c.bloodType}">{c.bloodType}</span>
		<div class="min-w-0"><p class="text-lg font-bold leading-6">{c.facility.name}</p><p class="text-[15px] text-muted">{c.facility.town}</p></div>
	</div>
	<p class="text-[15px] leading-[22px]">{c.publicText}</p>
	<div class="mt-auto grid {home ? '' : 'grid-cols-2'} gap-3">
		<a href="/calls/{c.code}/share" class="btn-secondary flex items-center justify-center gap-2 !h-11"><Icon name="share" class="h-5 w-5" />Share</a>
		{#if !home}<a href="/calls/{c.code}" class="btn-primary !h-11">Details</a>{/if}
	</div>
</article>
