<script lang="ts">
	import { page } from '$app/state'
	import { BRAND } from '$lib/brand'
	import Logo from '$lib/ui/Logo.svelte'

	const missing = $derived(page.status === 404)
	const code = $derived(missing ? 404 : page.status >= 500 ? page.status : 503)
</script>

<svelte:head><title>{missing ? 'Page not found' : 'Something went wrong'} | {BRAND.name}</title></svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-12 text-center">
	<a href="/" class="rounded-lg text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300"><Logo class="h-10" /></a>

	<div class="relative flex h-56 w-56 items-center justify-center">
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="#E11D48" class="absolute inset-0 h-full w-full opacity-[.14]"><path d="M12 2.6c-3.9 4.7-6.4 8.2-6.4 11.3a6.4 6.4 0 0 0 12.8 0c0-3.1-2.5-6.6-6.4-11.3z" /></svg>
		<p class="relative mt-8 text-[64px] font-extrabold leading-none tracking-tight text-rose-600">{code}</p>
	</div>

	<div class="flex flex-col gap-3">
		<p class="eyebrow">{missing ? 'Page not found' : 'Something went wrong'}</p>
		{#if missing}
			<h1 class="text-[34px] font-extrabold leading-10 tracking-tight md:text-[44px] md:leading-[50px]">We could not find that page</h1>
			<p class="text-base leading-6 text-muted">The link may be old, or the address may have a typo. A blood call that has closed can also be gone. Nothing is wrong with your account.</p>
		{:else}
			<h1 class="text-[34px] font-extrabold leading-10 tracking-tight md:text-[44px] md:leading-[50px]">We are having a problem on our side</h1>
			<p class="text-base leading-6 text-muted">The service is not answering right now. Your account and your details are safe. Please try again in a minute.</p>
		{/if}
	</div>

	<div class="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
		{#if missing}
			<a href="/" class="btn-primary sm:!w-auto sm:px-8">Go to home</a>
			<a href="/calls" class="btn-secondary sm:!w-auto sm:px-8">See open calls</a>
		{:else}
			<button type="button" class="btn-primary sm:!w-auto sm:px-8" onclick={() => location.reload()}>Try again</button>
			<a href="/" class="btn-secondary sm:!w-auto sm:px-8">Go to home</a>
		{/if}
	</div>

	<p class="text-[13px] leading-[18px] text-muted">
		{#if missing}Looking for a call? Use the code on your SMS, like CALL-0001, at <span class="font-semibold text-ink">/calls/CALL-0001</span>.{:else}Still stuck? In an emergency, call your hospital blood bank directly.{/if}
	</p>
</main>
