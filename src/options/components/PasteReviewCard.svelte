<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Writable } from 'svelte/store';
	import type { PasteReviewMode, Settings } from '../../shared/message-types';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	let {
		settings,
		setValue,
	}: {
		settings: Writable<Settings | null>;
		setValue: (value: PasteReviewMode) => Promise<void>;
	} = $props();

	let value = $derived<PasteReviewMode>($settings?.pasteReviewMode ?? 'manual');
</script>

<article class="card" id="paste-review-section">
	<CardHeading title={t('pasteReview.title')} hint={t('pasteReview.hint')} />
	<div class="row">
		<div class="info">
			<span class="row-label">{t('pasteReview.label')}</span>
			<p class="hint">
				{t('pasteReview.body')}
			</p>
		</div>
		<select
			aria-label={t('pasteReview.label')}
			value={value}
			onchange={(event) => setValue(event.currentTarget.value as PasteReviewMode)}
		>
			<option value="manual">{t('pasteReview.manual')}</option>
			<option value="auto">{t('pasteReview.auto')}</option>
		</select>
	</div>
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px; }
	.info { flex: 1; }
	.row-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
	.hint { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	select {
		padding: 8px 10px;
		border: var(--border-hairline);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-ink);
		font-size: 13px;
		cursor: pointer;
	}
</style>
