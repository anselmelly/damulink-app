<script lang="ts">
	import { ICONS } from '$lib/icons'
	let { name, class: cls = 'h-5 w-5' }: { name: string; class?: string } = $props()
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own icon paths, never user input -->
<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 {cls}">{@html ICONS[name] ?? ''}</svg>
