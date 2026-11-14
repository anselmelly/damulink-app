<script lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'

	let { children } = $props()

	// Wait until we know who is signed in; then send anyone else to the login page and bring them back afterwards.
	$effect(() => {
		if (auth.ready && !auth.user) void goto(`/login?redirect=${encodeURIComponent(page.url.pathname)}`, { replaceState: true })
	})
</script>

{#if auth.ready && auth.user}
	{@render children()}
{:else}
	<p class="p-8 text-center text-muted" role="status">Loading…</p>
{/if}
