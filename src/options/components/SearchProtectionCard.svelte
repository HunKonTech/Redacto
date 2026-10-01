<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Writable } from 'svelte/store';
	import type { Settings } from '../../shared/message-types';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';

	let {
		settings,
		setValue,
	}: {
		settings: Writable<Settings | null>;
		setValue: (value: boolean) => Promise<boolean>;
	} = $props();

	let value = $derived($settings?.searchProtectionEnabled ?? false);
	let declined = $state(false);
	// The toggle flips itself on click; redraw it from the setting when the
	// permission prompt is declined so it does not show "on".
	let toggleKey = $state(0);

	async function change(checked: boolean): Promise<void> {
		declined = !(await setValue(checked));
		if (declined) toggleKey += 1;
	}
</script>

<article class="card" id="search-protection-section">
	<CardHeading title={t('search.title')} hint="Bing, Google, DuckDuckGo, Ecosia, Brave, Startpage" />
	<div class="row">
		<div class="info">
			<span class="row-label">{t('search.label')}</span>
			<p class="hint">
				{t('search.body1Before')}<code>[PERSON_1]</code>{t('search.body1After')}
			</p>
			<p class="hint">
				{t('search.body2')}
			</p>
			{#if declined}
				<p class="hint warn">{t('search.declined')}</p>
			{/if}
		</div>
		{#key toggleKey}
			<Toggle size="sm" checked={value} label={t('search.label')} onchange={(checked) => void change(checked)} />
		{/key}
	</div>
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px; }
	.info { flex: 1; }
	.row-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
	.hint { margin: 0 0 6px; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	.hint:last-child { margin-bottom: 0; }
	.warn { color: var(--color-danger); }
	.hint code {
		padding: 1px 5px;
		border-radius: 3px;
		background: var(--color-surface);
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 11px;
	}
</style>
