<script lang="ts">
	let { type, size = 'md' }: { type: string; size?: 'sm' | 'md' } = $props()
</script>

<span class="flex shrink-0 items-center justify-center rounded-xl bg-rose-100 font-extrabold text-red-700 {size === 'sm' ? 'h-9 w-9 text-[13px]' : 'h-12 w-12 text-base'}" aria-label="Blood type {type === 'unsure' ? 'not sure' : type}">{type === 'unsure' ? '?' : type}</span>
