<script lang="ts" generics="T extends string">
	type Option = { value: T; label: string };
	let {
		options,
		value,
		onchange,
		ariaLabel,
	}: {
		options: Option[];
		value: T;
		onchange: (next: T) => void;
		ariaLabel?: string;
	} = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={ariaLabel}>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === option.value}
			class:active={value === option.value}
			onclick={() => onchange(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--color-muted-bg);
	}
	.segmented button {
		padding: 4px 12px;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--color-muted);
		font-size: 11.5px;
		font-weight: 500;
		cursor: pointer;
		transition: color 120ms ease, background 120ms ease;
	}
	.segmented button:hover {
		color: var(--color-ink);
	}
	.segmented button.active {
		background: var(--color-elevated);
		color: var(--color-ink);
		box-shadow: var(--shadow-sm), 0 0 0 1px var(--color-border);
	}
	.segmented button:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus);
	}
</style>
