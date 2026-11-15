<script lang="ts">
	import QRCode from 'qrcode'
	import Logo from './Logo.svelte'
	import { dayOf, monthOf } from '$lib/drives'
	import { driveDay, driveHours } from '@damu/shared-types'

	let { host, venue, town, facility, date, starts, ends, link }: { host: string; venue: string; town: string; facility: string; date: string; starts: string; ends: string; link: string } = $props()
	let qr = $state('')
	$effect(() => {
		QRCode.toString(link, { type: 'svg', margin: 0, width: 96, color: { dark: '#2A1218', light: '#FFFFFF' } }).then((s) => (qr = s)).catch(() => (qr = ''))
	})
	const shown = $derived(link.replace(/^https?:\/\//, ''))
</script>

<div class="relative overflow-hidden rounded-3xl bg-rose-600 p-6 text-white shadow-lg">
	<svg aria-hidden="true" viewBox="0 0 24 24" fill="#fff" class="pointer-events-none absolute -right-12 top-16 h-[330px] w-[270px] opacity-[.16]"><path d="M12 2.6c-3.9 4.7-6.4 8.2-6.4 11.3a6.4 6.4 0 0 0 12.8 0c0-3.1-2.5-6.6-6.4-11.3z" /></svg>
	<Logo class="relative h-8" />
	<p class="relative text-[13px] font-extrabold uppercase tracking-[.25em]">Blood drive</p>
	<p class="relative mt-3 flex items-baseline gap-3"><span class="text-[72px] font-extrabold leading-none">{date ? dayOf(date) : '–'}</span><span class="text-[28px] font-extrabold">{date ? monthOf(date) : ''}</span></p>
	<p class="relative mt-3 text-[22px] font-extrabold leading-7">{host || 'The host'} blood drive</p>
	<p class="relative mt-2 font-semibold">{date ? driveDay(date).split(' ')[0] : ''} {starts && ends ? driveHours(starts, ends) : ''} · {venue || 'Venue'}, {town}</p>
	<p class="relative mt-1 text-[14px] text-white/90">Hosted with {facility}</p>
	<div class="relative mt-4 flex items-center gap-4 rounded-2xl bg-white p-4 text-ink">
		{#if qr}<span class="h-24 w-24 shrink-0 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="QR code for the drive page">{@html qr}</span>{/if}
		<span class="min-w-0"><span class="block text-[14px] font-semibold">Scan, or say you are interested</span><span class="block break-all text-[17px] font-extrabold leading-6 text-red-700">{shown}</span></span>
	</div>
</div>
