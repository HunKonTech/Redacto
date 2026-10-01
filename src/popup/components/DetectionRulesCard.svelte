<script lang="ts">
	import { groupDescriptionKey, groupLabelKey } from '../../shared/i18n';
	import { t } from '../../shared/i18n/reactive';
	import type { CategoriesModel } from '../popup-model.svelte';
	import CardHeading from './CardHeading.svelte';
	import Toggle from './Toggle.svelte';

	let { categories, setCategoryEnabled }: Pick<CategoriesModel, 'categories' | 'enabledCount' | 'setCategoryEnabled'> = $props();
</script>

<article class="card">
	<CardHeading title={t('popup.rules.title')} hint={t('popup.rules.hint')} />
	<div class="rule-list" aria-label={t('popup.rules.aria')}>
		{#each $categories as category, index (category.id)}
			<label class="row">
				<span>
					<strong>{t(groupLabelKey(category.id))}</strong>
					<small>{t(groupDescriptionKey(category.id))}</small>
				</span>
				<Toggle size="sm" checked={category.enabled} label={t('popup.rules.toggle', { category: t(groupLabelKey(category.id)) })} onchange={(checked) => setCategoryEnabled(category.id, checked)} />
			</label>
			{#if index < $categories.length - 1}<div class="divider"></div>{/if}
		{/each}
	</div>
</article>

<style>
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.rule-list { padding: 6px 0; }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; }
	.row span { display: grid; gap: 1px; }
	strong { color: var(--color-ink); font-size: 13px; font-weight: 500; }
	small { color: var(--color-muted); font-size: 11px; }
	.divider { height: 1px; background: var(--color-border); }
</style>
