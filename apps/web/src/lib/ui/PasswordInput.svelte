<script lang="ts">
	import Icon from './Icon.svelte'
	let { id, label, value = $bindable(''), placeholder = '', autocomplete = 'current-password', error = '', help = '', labelExtra }: {
		id: string
		label: string
		value?: string
		placeholder?: string
		autocomplete?: 'current-password' | 'new-password'
		error?: string
		help?: string
		labelExtra?: import('svelte').Snippet
	} = $props()
	let show = $state(false)
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center justify-between">
		<label for={id} class="field-label">{label}</label>
		{@render labelExtra?.()}
	</div>
	<div class="relative">
		<input {id} name={id} type={show ? 'text' : 'password'} {autocomplete} {placeholder} bind:value class="field-input pr-14 {error ? 'is-error' : ''}" aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-err` : undefined} />
		<button type="button" onclick={() => (show = !show)} aria-label={show ? 'Hide password' : 'Show password'} class="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300">
			<Icon name={show ? 'eye-off' : 'eye'} class="h-[22px] w-[22px]" />
		</button>
	</div>
	{#if error}<span id="{id}-err" class="field-error"><Icon name="alert" class="h-4 w-4" />{error}</span>{:else if help}<span class="field-help">{help}</span>{/if}
</div>
