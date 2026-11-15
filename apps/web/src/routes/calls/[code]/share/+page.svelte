<script lang="ts">
	import { page } from '$app/state'
	import { BRAND } from '$lib/brand'
	import { closesOn, shortLink } from '$lib/calls'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'

	let { data } = $props()
	const c = $derived(data.call)
	let shape = $state<'square' | 'story'>('square')
	let svg: SVGSVGElement
	let copied = $state(false)
	const link = $derived(shortLink(page.url.origin, c.short))
	const size = $derived(shape === 'square' ? { w: 1080, h: 1080 } : { w: 1080, h: 1920 })
	const wa = $derived(`https://wa.me/?text=${encodeURIComponent(`${c.bloodType} blood needed at ${c.facility.name}, ${c.facility.town}. ${link}`)}`)
	/** The poster text, broken into lines that fit. */
	const lines = $derived(c.publicText.split(' ').reduce<string[]>((out, w) => ((out.at(-1)?.length ?? 99) + w.length < 30 ? (out[out.length - 1] += ` ${w}`) : out.push(w), out), []).slice(0, 6))
	async function copy() {
		await navigator.clipboard?.writeText(link).catch(() => {})
		copied = true
		setTimeout(() => (copied = false), 2000)
	}
	/** Draws the poster to a PNG and downloads it. */
	function save() {
		const img = new Image()
		img.onload = () => {
			const cv = document.createElement('canvas')
			cv.width = size.w
			cv.height = size.h
			cv.getContext('2d')!.drawImage(img, 0, 0)
			const a = document.createElement('a')
			a.href = cv.toDataURL('image/png')
			a.download = `${c.code}-${shape}.png`
			a.click()
		}
		img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
	}
</script>

<svelte:head><title>Poster for {c.code} | {BRAND.name}</title><meta name="robots" content="noindex" /></svelte:head>

<PublicNav />
<main class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
	<a href="/calls/{c.code}" class="link inline-flex items-center gap-1 self-start text-[15px]"><Icon name="chev-l" class="h-5 w-5" />Call details</a>
	<h1 class="text-[28px] font-extrabold leading-9 tracking-tight">Share this call</h1>
	<div class="flex gap-2" role="tablist">{#each [['square', 'Square'], ['story', 'Story']] as [k, l]}<button type="button" role="tab" aria-selected={shape === k} onclick={() => (shape = k as typeof shape)} class="h-11 rounded-xl border-[1.5px] px-5 font-semibold {shape === k ? 'border-rose-600 bg-rose-50 text-red-700' : 'border-field bg-white'}">{l}</button>{/each}</div>
	<div class="mx-auto w-full {shape === 'square' ? 'max-w-md' : 'max-w-xs'}">
		<svg bind:this={svg} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size.w} {size.h}" class="w-full rounded-2xl shadow" role="img" aria-label="Poster: {c.bloodType} blood needed at {c.facility.name}">
			<rect width={size.w} height={size.h} fill="#e11d48" />
			<path d="M{size.w - 200} {size.h - 520}c-120 150-200 260-200 360a200 200 0 0 0 400 0c0-100-80-210-200-360z" fill="#fff" opacity=".1" />
			<g font-family="system-ui, sans-serif" fill="#fff" text-anchor="middle">
				<text x={size.w / 2} y={shape === 'square' ? 150 : 320} font-size="44" font-weight="700" letter-spacing="6">BLOOD NEEDED</text>
				<text x={size.w / 2} y={shape === 'square' ? 400 : 640} font-size="260" font-weight="800">{c.bloodType}</text>
				<text x={size.w / 2} y={shape === 'square' ? 500 : 740} font-size="46" font-weight="700">{c.facility.name}</text>
				<text x={size.w / 2} y={shape === 'square' ? 560 : 800} font-size="38" opacity=".9">{c.facility.town}</text>
				{#each lines as l, i}<text x={size.w / 2} y={(shape === 'square' ? 680 : 940) + i * 56} font-size="40">{l}</text>{/each}
				<text x={size.w / 2} y={size.h - (shape === 'square' ? 120 : 260)} font-size="40" font-weight="700">Open until {closesOn(c.closesAt)}</text>
				<text x={size.w / 2} y={size.h - (shape === 'square' ? 60 : 200)} font-size="40" font-weight="700">{link.replace(/^https?:\/\//, '')}</text>
			</g>
		</svg>
	</div>
	<div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
		<a href={wa} target="_blank" rel="noopener" class="btn-primary sm:!w-auto sm:px-6">Send on WhatsApp</a>
		<button type="button" onclick={copy} class="btn-secondary sm:!w-auto sm:px-6">{copied ? 'Copied' : 'Copy link'}</button>
		<button type="button" onclick={save} class="btn-secondary sm:!w-auto sm:px-6">Save poster</button>
	</div>
	<p class="flex items-center justify-center gap-2 text-[14px] text-muted"><Icon name="lock" class="h-4 w-4" />No patient details are on the poster or the page.</p>
</main>
<PublicFooter />
