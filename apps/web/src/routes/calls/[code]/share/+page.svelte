<script lang="ts">
	import { page } from '$app/state'
	import { BRAND } from '$lib/brand'
	import { shortLink, urgencyLabel } from '$lib/calls'
	import Icon from '$lib/ui/Icon.svelte'
	import PublicFooter from '$lib/ui/PublicFooter.svelte'
	import PublicNav from '$lib/ui/PublicNav.svelte'

	let { data } = $props()
	const c = $derived(data.call)
	let copied = $state(false)
	const link = $derived(shortLink(page.url.origin, c.short))
	const shown = $derived(link.replace(/^https?:\/\//, ''))
	const linkSize = $derived(Math.min(76, Math.floor(860 / (0.6 * shown.length)))) // keeps the link inside the 940-wide white box
	const wa = $derived(`https://wa.me/?text=${encodeURIComponent(`${c.bloodType} blood needed at ${c.facility.name}, ${c.facility.town}. ${link}`)}`)
	const SHAPES = { square: { w: 1080, h: 1080, ty: 400, by: 520, fy: 600, ly: 670, box: 750 }, story: { w: 1080, h: 1920, ty: 740, by: 860, fy: 940, ly: 1010, box: 1520 } } as const
	type Shape = keyof typeof SHAPES
	/** The poster text, broken into lines that fit. */
	const lines = $derived(c.publicText.split(' ').reduce<string[]>((out, w) => ((out.at(-1)?.length ?? 99) + w.length < 34 ? (out[out.length - 1] += ` ${w}`) : out.push(w), out), []).slice(0, 3))
	async function copy() {
		await navigator.clipboard?.writeText(link).catch(() => {})
		copied = true
		setTimeout(() => (copied = false), 2000)
	}
	/** Draws the poster to a PNG and downloads it. */
	function save(shape: Shape) {
		const svg = document.getElementById(`poster-${shape}`)!
		const { w, h } = SHAPES[shape]
		const img = new Image()
		img.onload = () => {
			const cv = document.createElement('canvas')
			cv.width = w
			cv.height = h
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
<main class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<a href="/calls/{c.code}" class="link inline-flex h-11 items-center gap-1 self-start pr-3 text-[15px]"><Icon name="chev-l" class="h-[22px] w-[22px]" />Back to the call</a>
	<header class="flex flex-col gap-2">
		<h1 class="text-[34px] font-extrabold leading-10 tracking-tight md:text-[44px] md:leading-[50px]">Share this call</h1>
		<p class="max-w-2xl text-base leading-6 text-muted">{BRAND.name} made a poster for you. Post it to a status, a group, or print it. It shows only a blood type, a medical facility, and a short message.</p>
	</header>
	<div class="grid items-start gap-6 lg:grid-cols-[auto_auto_1fr]">
		{#each [['square', 'Square', 'Feed posts, groups, print'], ['story', 'Story', 'Status, 9:16']] as [k, l, d]}
			{@const sh = SHAPES[k as Shape]}
			<div class="flex flex-col gap-3">
				<svg id="poster-{k}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {sh.w} {sh.h}" class="w-full rounded-3xl lg:h-[540px] lg:w-auto" role="img" aria-label="Poster: {c.bloodType} blood needed at {c.facility.name}">
					<rect width={sh.w} height={sh.h} fill="#e11d48" />
					<path transform="translate({sh.w - 80} {sh.ty - 330}) scale(1.7)" d="M0 0c-110 140-190 240-190 330a190 190 0 0 0 380 0c0-90-80-190-190-330z" fill="#fff" opacity=".14" />
					<g font-family="system-ui, sans-serif" fill="#fff">
						<text x="70" y="130" font-size="68" font-weight="800">{BRAND.name}</text>
						{#if c.urgency !== 'normal'}<rect x="780" y="76" width="230" height="70" rx="35" fill="#fff" /><text x="895" y="124" font-size="34" font-weight="800" letter-spacing="3" text-anchor="middle" fill="#b91c1c">{urgencyLabel(c.urgency).toUpperCase()}</text>{/if}
						<text x="70" y={sh.ty} font-size="270" font-weight="800">{c.bloodType}</text>
						<text x="70" y={sh.by} font-size="76" font-weight="800">Blood needed</text>
						<text x="70" y={sh.fy} font-size="48" font-weight="700">{c.facility.name}, {c.facility.town}</text>
						{#each lines as ln, i}<text x="70" y={sh.ly + i * 52} font-size="38" opacity=".92">{ln}</text>{/each}
						<rect x="70" y={sh.box} width="940" height="230" rx="36" fill="#fff" />
						<text x="540" y={sh.box + 80} font-size="38" font-weight="600" text-anchor="middle" fill="#2b1014">Can you help? Please share, or open</text>
						<text x="540" y={sh.box + 170} font-size={linkSize} font-weight="800" text-anchor="middle" fill="#b91c1c">{shown}</text>
					</g>
				</svg>
				<p class="flex items-center justify-between text-[15px]"><span class="font-bold">{l}</span><span class="text-muted">{d}</span></p>
				<button type="button" onclick={() => save(k as Shape)} class="btn-secondary flex items-center justify-center gap-2"><Icon name="arrow" class="h-5 w-5 rotate-90" />Save poster ({k})</button>
			</div>
		{/each}
		<section class="card flex flex-col gap-3 p-6">
			<h2 class="text-lg font-bold">Share</h2>
			<a href={wa} target="_blank" rel="noopener" class="btn-primary flex items-center justify-center gap-2"><Icon name="message" class="h-5 w-5" />Send on WhatsApp</a>
			<button type="button" onclick={copy} class="btn-secondary flex items-center justify-center gap-2"><Icon name="copy" class="h-5 w-5" />{copied ? 'Copied' : 'Copy link'}</button>
			<div class="rounded-xl bg-rose-50 px-4 py-4 text-center"><p class="text-[13px] text-muted">Link</p><p class="text-xl font-extrabold text-red-700">{shown}</p></div>
			<p class="flex items-start gap-2 text-[13px] text-muted"><Icon name="lock" class="mt-0.5 h-4 w-4 shrink-0" />No patient details are on the poster or the page.</p>
		</section>
	</div>
</main>
<PublicFooter />
