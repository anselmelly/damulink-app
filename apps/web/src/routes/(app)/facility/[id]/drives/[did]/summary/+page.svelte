<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { auth } from '$lib/auth.svelte'
	import { BRAND } from '$lib/brand'
	import { longDay } from '$lib/drives'
	import { driveHours, type DriveSummary, type MyFacilityView } from '@damu/shared-types'
	import FacilityShell from '$lib/ui/FacilityShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'

	const id = $derived(page.params.id)
	const did = $derived(page.params.did)
	let f = $state<MyFacilityView | null>(null)
	let s = $state<DriveSummary | null>(null)
	let missing = $state(false)
	const justClosed = page.url.searchParams.get('closed') === '1'
	onMount(async () => {
		try {
			f = await auth.call<MyFacilityView>(`/my-facilities/${id}`)
			s = await auth.call<DriveSummary>(`/my-facilities/${id}/drives/${did}/summary`)
		} catch {
			missing = true
		}
	})
	/** Counts only, so the file is built here from what the page already has. */
	function download() {
		if (!s) return
		const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
		const rows: [string, string | number][] = [
			['Drive', `${s.code} ${s.host}`], ['Date', s.date], ['Venue', `${s.venue}, ${s.town}`], ['Target', s.target ?? ''],
			['Checked in', s.counts.checkedIn], ['Donated', s.counts.donated], ['Deferred', s.counts.deferred], ['Tested only', s.counts.tested], ['Walk-ins', s.counts.walkins], ['Checked in by donor code', s.counts.byCode],
			['Said they were interested', s.came.interested], ['Interested and came', s.came.interestedCame], ['New sign-ups', s.came.signups],
			...Object.entries(s.bloodTypes).map(([t, n]): [string, number] => [`Blood type ${t}`, n]),
		]
		const a = document.createElement('a')
		a.href = URL.createObjectURL(new Blob([rows.map(([k, v]) => `${cell(k)},${cell(v)}`).join('\n') + '\n'], { type: 'text/csv' }))
		a.download = `${s.code}-summary.csv`
		a.click()
		URL.revokeObjectURL(a.href)
	}
	const types = $derived(s ? Object.entries(s.bloodTypes).sort((a, b) => b[1] - a[1]) : [])
	const top = $derived(Math.max(1, ...types.map(([, n]) => n)))
</script>

<svelte:head><title>Drive summary | {BRAND.name}</title></svelte:head>

<FacilityShell {f} width="wide" active="drives">
	{#if missing}
		<div class="card p-8 text-center text-muted">The summary is ready once the drive is closed. <a class="link" href="/facility/{id}/drives/{did}">Back to the drive</a></div>
	{:else if s}
		{#if justClosed}<p class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-red-700" /><span><b>Drive closed.</b> The public page is down and the interested list was deleted.</span></p>{/if}
		<header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex flex-col gap-1.5">
				<p class="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">Drive summary · {s.code}</p>
				<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">{s.host}</h1>
				<p class="text-base text-muted">{longDay(s.date)} {s.date.slice(0, 4)} · {driveHours(s.starts, s.ends)} · {s.venue}, {s.town}</p>
			</div>
			<button type="button" class="btn-secondary flex !w-auto items-center gap-2 px-5" onclick={download}><Icon name="copy" />Download summary</button>
		</header>

		<section class="card flex flex-col gap-5 p-6" aria-label="Totals">
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
				{#each [['Checked in', s.counts.checkedIn, 'text-ink'], ['Donated', s.counts.donated, 'text-emerald-700'], ['Deferred', s.counts.deferred, 'text-amber-800'], ['Tested only', s.counts.tested, 'text-rose-600']] as [l, n, c]}<div><span class="block text-[34px] font-extrabold leading-10 {c}">{n}</span><span class="text-base text-muted">{l}</span></div>{/each}
			</div>
			{#if s.target}<div class="flex flex-col gap-2"><div class="flex justify-between font-semibold"><span>Target</span><span>{s.counts.donated} of {s.target} donations ({s.percent}%)</span></div><div class="h-2.5 overflow-hidden rounded-full bg-rose-100"><div class="h-full bg-emerald-600" style="width:{s.percent ?? 0}%"></div></div></div>{/if}
		</section>

		<div class="grid gap-6 md:grid-cols-2">
			<section class="card flex flex-col gap-2 p-6"><h2 class="text-xl font-bold">Who came</h2>
				<dl class="flex flex-col divide-y divide-rose-100 text-[15px]">
					{#each [['Said they were interested', `${s.came.interested} posted, ${s.came.interestedCame} came`], ['Checked in by donor code', s.came.byCode], ['Walk-ins added', s.came.walkins], ['New sign-ups on the day', s.came.signups]] as [l, v]}<div class="flex justify-between py-3"><dt class="text-muted">{l}</dt><dd class="font-bold">{v}</dd></div>{/each}
				</dl>
			</section>
			<section class="card flex flex-col gap-3 p-6"><h2 class="text-xl font-bold">Blood types donated</h2>
				<p class="text-[13px] text-muted">Walk-ins without a known type show once the lab confirms.</p>
				{#if !types.length}<p class="text-muted">No types recorded yet.</p>{:else}
					<ul class="flex flex-col gap-3">{#each types as [t, n]}<li class="flex items-center gap-3"><span class="w-10 font-bold text-rose-600">{t}</span><span class="h-2.5 flex-1 overflow-hidden rounded-full bg-rose-100"><span class="block h-full bg-rose-500" style="width:{(n / top) * 100}%"></span></span><span class="w-6 text-right font-bold">{n}</span></li>{/each}</ul>
				{/if}
			</section>
		</div>
		<p class="flex items-center gap-2 text-[13px] text-muted"><Icon name="lock" class="h-4 w-4" />No names here. Each outcome is on the donor's own record.</p>

		{#if s.pendingResults}
			<section class="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between"><div><h2 class="text-lg font-bold">Results come back later</h2><p class="text-muted">Enter lab results as they arrive. {s.pendingResults} {s.pendingResults === 1 ? 'result is' : 'results are'} still waiting.</p></div><a class="btn-primary sm:!w-auto sm:px-8" href="/facility/{id}/lab-results">Enter lab results</a></section>
		{/if}
		<div class="flex flex-col gap-3 sm:flex-row"><a class="btn-secondary flex-1" href="/facility/{id}/drives/new">Plan another drive</a><a class="btn-primary flex-1" href="/facility/{id}/home">Back to home</a></div>
	{:else}
		<p class="text-muted" role="status">Loading…</p>
	{/if}
</FacilityShell>
