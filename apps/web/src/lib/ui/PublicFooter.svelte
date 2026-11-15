<script lang="ts">
	import Logo from './Logo.svelte'
	import { BRAND } from '$lib/brand'
</script>

<footer class="border-t border-rose-100 bg-rose-50">
	<div class="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 md:flex-row md:justify-between">
		<div class="flex max-w-sm flex-col gap-3">
			<a href="/" class="-ml-2 inline-flex flex-col items-start text-rose-600"><Logo /></a>
			<p class="text-[15px] leading-6 text-muted">Connecting verified medical facilities, donors, and families. Patient details are never shown publicly.</p>
		</div>
		<nav aria-label="Footer" class="grid grid-cols-2 gap-x-14 gap-y-3 text-[15px] font-semibold sm:grid-cols-3">
			<a href="/calls" class="link">Calls for blood</a><a href="/drives" class="link">Blood drives</a><a href="/#how" class="link">How it works</a><a href="/#facilities" class="link">For medical facilities</a><a href="/login" class="link">Log in</a><a href="/create-account" class="link">Sign up</a>
		</nav>
	</div>
	<div class="border-t border-rose-100 py-5 text-center text-[13px] text-muted">{new Date().getFullYear()} {BRAND.name}. Facility screening on the day has the final say on every donation.</div>
</footer>
