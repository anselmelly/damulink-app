<script lang="ts">
	import '../app.css'
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'

	let { children } = $props()
	onMount(() => void auth.init())
</script>

{@render children()}
