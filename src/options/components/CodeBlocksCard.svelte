<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Writable } from 'svelte/store';
	import type { CodeAnonymizationMode, Settings } from '../../shared/message-types';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';

	let {
		settings,
		setValue,
		setCodeAnonymization,
		setShareCodeLanguage,
		setHighlightCodeSyntax,
	}: {
		settings: Writable<Settings | null>;
		setValue: (value: boolean) => Promise<void>;
		setCodeAnonymization: (value: CodeAnonymizationMode) => Promise<void>;
		setShareCodeLanguage: (value: boolean) => Promise<void>;
		setHighlightCodeSyntax: (value: boolean) => Promise<void>;
	} = $props();

	let value = $derived($settings?.skipCodeBlocks ?? false);
	let codeMode = $derived($settings?.codeAnonymization ?? 'secrets');
	let codeSecrets = $derived(codeMode !== 'off');
	let renameIdentifiers = $derived(codeMode === 'full');
	let shareCodeLanguage = $derived($settings?.shareCodeLanguage ?? false);
	let highlightCodeSyntax = $derived($settings?.highlightCodeSyntax ?? false);
</script>

<article class="card" id="code-blocks-section">
	<CardHeading title={t('code.title')} hint={t('code.hint')} />
	<div class="row">
		<div class="info">
			<span class="row-label">{t('code.secrets')}</span>
			<p class="hint">
				{t('code.secrets.hintBefore')}<code>db.acme.internal</code>{t('code.secrets.hintAfter')}
			</p>
		</div>
		<Toggle size="sm" checked={codeSecrets} label={t('code.secrets')} onchange={(checked) => setCodeAnonymization(checked ? 'secrets' : 'off')} />
	</div>
	<div class="row">
		<div class="info">
			<span class="row-label">{t('code.rename')}</span>
			<p class="hint">
				{t('code.rename.hint1')}<code>alma</code>{t('code.rename.hint2')}<code>var1</code>{t('code.rename.hint3')}<code>alma.nev</code>{t('code.rename.hint4')}<code>var1.field2</code>{t('code.rename.hint5')}<code>getPERSON_1Invoice</code>{t('code.rename.hint6')}
			</p>
		</div>
		<Toggle
			size="sm"
			checked={renameIdentifiers}
			label={t('code.rename')}
			onchange={(checked) => setCodeAnonymization(checked ? 'full' : 'secrets')}
		/>
	</div>
	{#if renameIdentifiers}
		<div class="row">
			<div class="info">
				<span class="row-label">{t('code.shareLanguage')}</span>
				<p class="hint">
					{t('code.shareLanguage.hintBefore')}<code>```python</code>{t('code.shareLanguage.hintAfter')}
				</p>
			</div>
			<Toggle
				size="sm"
				checked={shareCodeLanguage}
				label={t('code.shareLanguage')}
				onchange={(checked) => setShareCodeLanguage(checked)}
			/>
		</div>
	{/if}
	<div class="row">
		<div class="info">
			<span class="row-label">{t('code.highlight')}</span>
			<p class="hint">
				{t('code.highlight.hintBefore')}<code>```python</code>{t('code.highlight.hintAfter')}
			</p>
		</div>
		<Toggle
			size="sm"
			checked={highlightCodeSyntax}
			label={t('code.highlight')}
			onchange={(checked) => setHighlightCodeSyntax(checked)}
		/>
	</div>
	<div class="row">
		<div class="info">
			<span class="row-label">{t('code.skip')}</span>
			<p class="hint">
				{t('code.skip.hintBefore')}<code>&lt;code&gt;</code>/<code>&lt;pre&gt;</code>{t('code.skip.hintAfter')}
			</p>
		</div>
		<Toggle size="sm" checked={value} label={t('code.skip')} onchange={(checked) => setValue(checked)} />
	</div>
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.row + .row { border-top: var(--border-hairline); }
	.row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px; }
	.info { flex: 1; }
	.row-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
	.hint { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	.hint code {
		padding: 1px 5px;
		border-radius: 3px;
		background: var(--color-surface);
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 11px;
	}
</style>
