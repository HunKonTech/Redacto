<script lang="ts">
	import { groupLabelKey } from '../../shared/i18n';
	import { t } from '../../shared/i18n/reactive';
	import type { CategoriesModel } from '../popup-model.svelte';
	import CardHeading from './CardHeading.svelte';

	let { categories, enabledCount, toggleCategory }: Pick<CategoriesModel, 'categories' | 'enabledCount' | 'toggleCategory'> = $props();
</script>

<article class="card">
	<CardHeading title={t('popup.categories.title')} badge={`${$enabledCount}/${$categories.length}`} />
	<div class="chip-grid" aria-label={t('popup.categories.aria')}>
		{#each $categories as category (category.id)}
			<button type="button" class={['chip', category.enabled && 'enabled']} aria-pressed={category.enabled} onclick={() => toggleCategory(category.id)}>
				<span class="chip-dot"></span>{t(groupLabelKey(category.id))}
			</button>
		{/each}
	</div>
</article>

<style>
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.chip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px; }
	.chip {
		display: flex; align-items: center; gap: 7px; padding: 8px 10px; border: 0; border-radius: var(--radius-sm);
		background: var(--color-muted-bg); color: var(--color-subtle); font-size: 12px; font-weight: 400; cursor: pointer; text-align: left;
	}
	.chip.enabled { background: var(--color-accent-soft); color: var(--color-accent); }
	.chip-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--color-toggle-off); flex-shrink: 0; }
	.chip.enabled .chip-dot { background: var(--color-success); }
</style>
