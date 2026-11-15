<script lang="ts">
	import { onMount } from 'svelte'
	import { auth } from '$lib/auth.svelte'
	import { ApiError } from '$lib/api'
	import { BRAND } from '$lib/brand'
	import AdminShell from '$lib/ui/AdminShell.svelte'
	import Icon from '$lib/ui/Icon.svelte'
	import { BLOOD_TYPES, type AdminSettings } from '@damu/shared-types'

	let data = $state<AdminSettings | null>(null)
	let values = $state<Record<string, string>>({})
	let errors = $state<Record<string, string>>({})
	let error = $state('')
	let saved = $state(false)
	let busy = $state(false)
	async function load() {
		data = await auth.call<AdminSettings>('/admin/settings')
		values = Object.fromEntries(data.groups.flatMap((g) => g.fields.map((f) => [f.key, String(f.value)])))
	}
	onMount(() => void load().catch(() => (error = 'Could not load the settings.')))
	async function save(e: SubmitEvent) {
		e.preventDefault()
		if (!data) return
		busy = true
		error = ''
		errors = {}
		saved = false
		const changes: Record<string, number> = {}
		for (const f of data.groups.flatMap((g) => g.fields)) if (values[f.key].trim() !== String(f.value)) changes[f.key] = Number(values[f.key])
		try {
			await auth.call('/admin/settings', { method: 'PATCH', body: { changes } })
			saved = true
			await load()
		} catch (err) {
			if (err instanceof ApiError) {
				errors = err.fields
				error = Object.keys(err.fields).length ? '' : err.message
			} else error = 'Something went wrong.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head><title>System settings | {BRAND.name}</title></svelte:head>

<AdminShell active="settings">
	<header class="flex flex-col gap-1.5">
		<h1 class="text-[30px] font-extrabold leading-9 tracking-tight md:text-[38px] md:leading-[44px]">System settings</h1>
		<p class="text-base leading-6 text-muted">Changes apply from now on. Each change is written to the audit log. Values marked draft are placeholders to confirm with the national blood service.</p>
	</header>
	{#if saved}<p class="notice" role="status"><Icon name="check" class="mt-px h-[22px] w-[22px] text-emerald-700" />Settings saved.</p>{/if}
	{#if error}<p class="notice-error" role="alert"><Icon name="alert" class="mt-px h-[22px] w-[22px] text-red-700" />{error}</p>{/if}
	{#if data}
		<form class="flex flex-col gap-6" onsubmit={save}>
			{#each data.groups as g (g.id)}
				<section class="card flex flex-col gap-5 p-6 md:p-8" aria-labelledby="g-{g.id}">
					<div class="flex flex-col gap-1.5"><h2 id="g-{g.id}" class="flex items-center gap-3 text-xl font-bold">{g.title}{#if g.draft}<span class="badge badge-warn">Draft</span>{/if}</h2><p class="text-[15px] text-muted">{g.note}</p></div>
					<div class="grid gap-5 sm:grid-cols-2">
						{#each g.fields as f (f.key)}
							<div class="flex flex-col gap-2">
								<label for={f.key} class="field-label">{f.label}</label>
								<div class="relative"><input id={f.key} inputmode="numeric" bind:value={values[f.key]} class="field-input !pr-24 {errors[f.key] ? 'is-error' : ''}" /><span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-muted">{f.unit}</span></div>
								{#if errors[f.key]}<span class="field-error"><Icon name="alert" class="h-4 w-4" />{errors[f.key]}</span>{:else}<span class="field-help">{f.min} to {f.max}</span>{/if}
							</div>
						{/each}
					</div>
				</section>
				{#if g.id === 'eligibility'}
					<section class="card flex flex-col gap-4 p-6 md:p-8" aria-labelledby="g-compat">
						<div class="flex flex-col gap-1.5"><h2 id="g-compat" class="flex items-center gap-3 text-xl font-bold">Compatibility table<span class="badge badge-neutral">Fixed</span></h2><p class="text-[15px] text-muted">Standard blood compatibility, the same everywhere. It cannot be edited here. Attendants can only narrow the donor types when they publish a call, never add others.</p></div>
						<div class="overflow-x-auto"><table class="w-full min-w-[560px] text-center text-[15px]">
							<thead><tr class="text-[12px] uppercase tracking-wider text-muted"><th class="py-2 text-left font-semibold">Patient</th>{#each BLOOD_TYPES as d}<th class="py-2 font-bold text-rose-600">{d}</th>{/each}</tr></thead>
							<tbody class="divide-y divide-rose-100">{#each BLOOD_TYPES as p}<tr class="h-11"><th class="text-left font-bold">{p}</th>{#each BLOOD_TYPES as d}<td>{#if data.compatibility[p].includes(d)}<Icon name="check" class="mx-auto h-5 w-5 text-emerald-700" />{:else}<span class="text-muted">-</span>{/if}</td>{/each}</tr>{/each}</tbody>
						</table></div>
					</section>
				{/if}
			{/each}
			<div class="flex gap-3"><button type="button" class="btn-secondary sm:!w-auto sm:px-8" onclick={() => void load()}>Cancel</button><button class="btn-primary sm:!w-auto sm:px-10" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
		</form>
	{:else if !error}<p class="text-muted" role="status">Loading…</p>{/if}
</AdminShell>
