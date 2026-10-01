<script lang="ts">
	let { title, badge, hint }: { eyebrow?: string; title: string; badge?: string | number; hint?: string; badgeClass?: string; compact?: boolean } = $props();
</script>

<div class="card-head">
	<span class="card-title">{title}</span>
	{#if badge !== undefined}
		<span class="count">{badge}</span>
	{:else if hint}
		<span class="card-hint">{hint}</span>
	{/if}
</div>

<style>
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 12px 14px 10px;
		border-bottom: 1px solid var(--color-border);
	}
	.card-title {
		color: var(--color-ink);
		font-size: 12.5px;
		font-weight: 600;
		letter-spacing: -0.05px;
	}
	.count {
		padding: 1px 8px;
		border-radius: var(--radius-pill);
		background: var(--color-muted-bg);
		color: var(--color-muted);
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 600;
	}
	.card-hint {
		overflow: hidden;
		color: var(--color-subtle);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.5px;
		text-align: right;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
</style>
