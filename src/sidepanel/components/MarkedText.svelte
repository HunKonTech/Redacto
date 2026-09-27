<script lang="ts">
	import type { Segment } from '../segments';

	let { segments, label, oncopy }: { segments: Segment[]; label: string; oncopy?: () => void } = $props();
</script>

<!-- Selecting and copying by hand is as good as the Copy button. -->
<div class="marked" role="region" aria-label={label} {oncopy}>{#each segments as segment, index (index)}{#if segment.mark}<mark class={`tone-${segment.mark.tone}`} title={segment.mark.title}>{segment.text}</mark>{:else}{segment.text}{/if}{/each}</div>

<style>
	.marked {
		box-sizing: border-box;
		max-height: 40vh;
		min-height: 64px;
		margin: 0;
		padding: 10px;
		overflow: auto;
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
		background: #f8fafc;
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
</style>
