<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		onchange,
		size = 'md'
	}: { checked?: boolean; label: string; onchange?: (checked: boolean) => void; size?: 'md' | 'sm' } = $props();

	function toggle() {
		checked = !checked;
		onchange?.(checked);
	}
</script>

<button
	class={['toggle', size, checked && 'checked']}
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	onclick={toggle}
>
	<span></span>
</button>

<style>
	.toggle {
		box-sizing: border-box;
		flex: 0 0 var(--toggle-width);
		width: var(--toggle-width);
		height: var(--toggle-height);
		padding: 3px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--color-toggle-off);
		cursor: pointer;
		transition: background 160ms ease, box-shadow 160ms ease;
	}

	.toggle.sm {
		--toggle-width: 36px;
		--toggle-height: 21px;
		--toggle-knob: 15px;
	}

	.toggle span {
		display: block;
		width: var(--toggle-knob);
		height: var(--toggle-knob);
		border-radius: 50%;
		background: #ffffff;
		box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
		transition: transform 180ms cubic-bezier(0.3, 0.7, 0.4, 1);
	}

	.toggle.checked {
		background: var(--color-accent);
	}

	.toggle.checked span {
		transform: translateX(calc(var(--toggle-width) - var(--toggle-knob) - 6px));
	}

	.toggle:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus);
	}
</style>
