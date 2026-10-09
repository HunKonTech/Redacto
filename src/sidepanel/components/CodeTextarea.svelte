<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { syntaxPieces, type SyntaxRun } from '../../shared/code-highlight';

	let {
		value = $bindable(''),
		highlighted = null,
		minHeight = 110,
		...rest
	}: Omit<HTMLTextareaAttributes, 'value'> & {
		value?: string;
		/**
		 * Syntax colouring for `text`; null leaves the field plain. While the
		 * value differs from `text` (typing ahead of the colouring), it is shown plain.
		 */
		highlighted?: { text: string; runs: SyntaxRun[] } | null;
		minHeight?: number;
	} = $props();

	let backdrop = $state<HTMLPreElement | null>(null);
	const pieces = $derived(
		highlighted && highlighted.text === value ? syntaxPieces(value, highlighted.runs) : [{ text: value }],
	);

	function syncScroll(event: Event): void {
		if (!backdrop) return;
		const field = event.currentTarget as HTMLTextAreaElement;
		backdrop.scrollTop = field.scrollTop;
		backdrop.scrollLeft = field.scrollLeft;
	}
</script>

{#if highlighted}
	<!-- The text is drawn by the coloured copy behind a transparent textarea, which keeps the caret, selection and editing. -->
	<div class="field" style:--min-height={`${minHeight}px`}>
		<pre class="backdrop" bind:this={backdrop} aria-hidden="true">{#each pieces as piece, index (index)}{#if piece.kind}<span class={`syn-${piece.kind}`}>{piece.text}</span>{:else}{piece.text}{/if}{/each}{'\n'}</pre>
		<textarea bind:value {...rest} class="over" onscroll={syncScroll}></textarea>
	</div>
{:else}
	<textarea bind:value {...rest} style:--min-height={`${minHeight}px`}></textarea>
{/if}

<style>
	textarea, .backdrop {
		box-sizing: border-box; width: 100%; min-height: var(--min-height); margin: 0; padding: 10px;
		border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm);
		font: 11px/1.5 var(--font-mono); letter-spacing: normal; tab-size: 4;
		white-space: pre-wrap; overflow-wrap: anywhere; scrollbar-gutter: stable;
	}
	textarea {
		display: block; resize: vertical; outline: none; overflow-y: auto;
		background: var(--color-input); color: var(--color-ink);
	}
	textarea:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-focus); }

	.field { position: relative; border-radius: var(--radius-sm); background: var(--color-input); }
	.backdrop {
		position: absolute; inset: 0; overflow: hidden; pointer-events: none;
		border-color: transparent; color: var(--color-ink);
	}
	textarea.over { position: relative; background: transparent; color: transparent; caret-color: var(--color-ink); }
	textarea.over::placeholder { color: var(--color-subtle); }
	/* See-through, or it hides the coloured text behind it (IDE themes give an opaque accent-soft). */
	textarea.over::selection { color: transparent; background: color-mix(in srgb, var(--color-accent) 35%, transparent); }

	.syn-keyword { color: var(--color-accent); }
	.syn-string { color: var(--color-group-location-fg); }
	.syn-number, .syn-literal { color: var(--color-group-organization-fg); }
	.syn-comment { color: var(--color-subtle); font-style: italic; }
	.syn-title { color: var(--color-group-contact-fg); }
	.syn-type { color: var(--color-group-network-fg); }
	.syn-meta { color: var(--color-group-financial-fg); }
	.syn-variable { color: var(--color-group-identity-fg); }
</style>
