<script lang="ts">
	import { syntaxPieces, type SyntaxKind, type SyntaxRun } from '../../shared/code-highlight';
	import type { Segment } from '../segments';

	let {
		segments,
		label,
		oncopy,
		syntax = [],
	}: {
		segments: Segment[];
		label: string;
		oncopy?: () => void;
		/** Syntax colouring of the joined segment texts; marked segments keep their own colour. */
		syntax?: SyntaxRun[];
	} = $props();

	type Piece = { text: string; mark?: Segment['mark']; kind?: SyntaxKind };

	const pieces = $derived.by((): Piece[] => {
		if (syntax.length === 0) return segments;
		const text = segments.map((segment) => segment.text).join('');
		const out: Piece[] = [];
		let offset = 0;
		for (const segment of segments) {
			const end = offset + segment.text.length;
			if (segment.mark) out.push(segment);
			else out.push(...syntaxPieces(text, syntax, offset, end));
			offset = end;
		}
		return out;
	});
</script>

<!-- Selecting and copying by hand is as good as the Copy button. -->
<div class="marked" role="region" aria-label={label} {oncopy}>{#each pieces as piece, index (index)}{#if piece.mark}<mark class={`tone-${piece.mark.tone}`} title={piece.mark.title}>{piece.text}</mark>{:else if piece.kind}<span class={`syn-${piece.kind}`}>{piece.text}</span>{:else}{piece.text}{/if}{/each}</div>

<style>
	.marked {
		box-sizing: border-box;
		max-height: 40vh;
		min-height: 64px;
		margin: 0;
		padding: 10px;
		overflow: auto;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-input);
		color: var(--color-ink);
		font: 11px/1.55 var(--font-mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	mark {
		padding: 0 2px;
		border-radius: 3px;
		border-bottom: 1px solid currentColor;
		background: var(--color-group-low-signal-bg);
		color: var(--color-group-low-signal-fg);
	}
	mark.tone-identity { background: var(--color-group-identity-bg); color: var(--color-group-identity-fg); }
	mark.tone-contact { background: var(--color-group-contact-bg); color: var(--color-group-contact-fg); }
	mark.tone-financial { background: var(--color-group-financial-bg); color: var(--color-group-financial-fg); }
	mark.tone-network { background: var(--color-group-network-bg); color: var(--color-group-network-fg); }
	mark.tone-location { background: var(--color-group-location-bg); color: var(--color-group-location-fg); }
	mark.tone-password { background: var(--color-group-password-bg); color: var(--color-group-password-fg); }
	mark.tone-organization { background: var(--color-group-organization-bg); color: var(--color-group-organization-fg); }

	.syn-keyword { color: var(--color-accent); }
	.syn-string { color: var(--color-group-location-fg); }
	.syn-number, .syn-literal { color: var(--color-group-organization-fg); }
	.syn-comment { color: var(--color-subtle); font-style: italic; }
	.syn-title { color: var(--color-group-contact-fg); }
	.syn-type { color: var(--color-group-network-fg); }
	.syn-meta { color: var(--color-group-financial-fg); }
	.syn-variable { color: var(--color-group-identity-fg); }
</style>
