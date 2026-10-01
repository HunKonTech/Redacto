<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { TestModel } from '../popup-model.svelte';
	import CardHeading from './CardHeading.svelte';

	let { feedbackCounts }: Pick<TestModel, 'feedbackCounts' | 'clearFeedback'> = $props();
</script>

<article class="card">
	<CardHeading title={t('popup.feedback.title')} />
	<div class="stat-row">
		<div><strong>{$feedbackCounts.confirmed}</strong><span>{t('popup.feedback.corrections')}</span></div>
		<div><strong>{$feedbackCounts.ignored}</strong><span>{t('popup.feedback.allowlist')}</span></div>
	</div>
</article>

<style>
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.stat-row { display: flex; }
	.stat-row div { flex: 1; padding: 12px 8px; text-align: center; border-right: 1px solid var(--color-border); }
	.stat-row div:last-child { border-right: 0; }
	strong { display: block; color: var(--color-ink); font-family: var(--font-mono); font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }
	span { display: block; margin-top: 2px; color: var(--color-muted); font-size: 10px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
</style>
