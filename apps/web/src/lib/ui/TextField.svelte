<script lang="ts">
	import Icon from './Icon.svelte'
	let { id, label, value = $bindable(''), type = 'text', placeholder = '', autocomplete = 'off' as const, inputmode, error = '', help = '' }: {
		id: string
		label: string
		value?: string
		type?: string
		placeholder?: string
		autocomplete?: import('svelte/elements').FullAutoFill
		inputmode?: 'numeric' | 'email' | 'tel' | 'text'
		error?: string
		help?: string
	} = $props()
</script>

<div class="flex min-w-0 flex-col gap-2">
	<label for={id} class="field-label">{label}</label>
	<input {id} name={id} {type} {placeholder} {autocomplete} {inputmode} bind:value class="field-input {error ? 'is-error' : ''}" aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-err` : undefined} />
	{#if error}<span id="{id}-err" class="field-error"><Icon name="alert" class="h-4 w-4" />{error}</span>{:else if help}<span class="field-help">{help}</span>{/if}
</div>
