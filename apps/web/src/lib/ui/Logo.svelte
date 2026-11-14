<script lang="ts">
	import { BRAND } from '$lib/brand'
	import { LOGO_INNER, LOGO_VIEWBOX } from '$lib/logo'
	let { class: cls = 'h-9 md:h-11' }: { class?: string } = $props()
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own wordmark, never user input -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox={LOGO_VIEWBOX} role="img" aria-label={BRAND.name} class="w-auto {cls}">{@html LOGO_INNER}</svg>
