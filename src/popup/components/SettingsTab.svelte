<script lang="ts">
	import { t, tp } from '../../shared/i18n/reactive';
	import type { Readable, Writable } from 'svelte/store';
	import type { FeedbackCounts } from '../popup-model.svelte';
	import type { NerModelKey, Settings } from '../../shared/message-types';
	import type { NerModelChoice } from '../../shared/constants';
	import Toggle from './Toggle.svelte';
	import LegalCard from './LegalCard.svelte';
	import { MODEL_SOURCE } from '../../shared/local-ai-model-download';
	import { modelDownloadState } from '../../shared/model-download-store';
	import { modelDownloadedAt, modelDownloadText, modelSize } from './model-download-text';

	let {
		minConfidence,
		debug,
		clipboardInterceptEnabled,
		nerModel,
		nerModelChoice,
		nerModelChoices,
		sensitivityMode,
		feedbackCounts,
		mappingCount,
		setMinConfidence,
		setDebug,
		setClipboardInterceptEnabled,
		setNerModelChoice,
		openOptions,
		openIssueReport,
		openSecurityReport,
		openPrivacySupport,
		openPrivacyPolicy,
		openTermsOfUse,
		openImpressum,
		clearFeedback,
		clearMappings,
	}: {
		minConfidence: Writable<number>;
		debug: Writable<boolean>;
		clipboardInterceptEnabled: Writable<boolean>;
		nerModel: Writable<NerModelKey>;
		nerModelChoice: Writable<string>;
		nerModelChoices: readonly NerModelChoice[];
		sensitivityMode: Writable<Settings['sensitivityMode']>;
		feedbackCounts: Writable<FeedbackCounts>;
		mappingCount: Writable<number>;
		setMinConfidence: (value: number) => Promise<void>;
		setDebug: (enabled: boolean) => Promise<void>;
		setClipboardInterceptEnabled: (enabled: boolean) => Promise<void>;
		setNerModelChoice: (value: string) => Promise<void>;
		openOptions: () => void;
		openIssueReport: () => void;
		openSecurityReport: () => void;
		openPrivacySupport: () => void;
		openPrivacyPolicy: () => void;
		openTermsOfUse: () => void;
		openImpressum: () => void;
		clearFeedback: () => Promise<void>;
		clearMappings: () => Promise<void>;
	} = $props();
	let sliderValue = $derived(Math.round($minConfidence * 100));
	const modelSummary = $derived.by(() => {
		const state = $modelDownloadState;
		if (!state.readyVersion || state.phase !== 'idle') return modelDownloadText(state);
		const at = modelDownloadedAt(state);
		return [state.readyVersion, modelSize(state), at && t('modelCard.downloadedOn', { date: at })].filter(Boolean).join(' · ');
	});

	function openModelOptions(): void {
		void chrome.tabs.create({ url: `${chrome.runtime.getURL('options/options.html')}#local-ai-model-section` });
	}
</script>

<div class="settings-stack">
	<article class="card">
		<div class="head"><span>{t('settings.detection')}</span></div>
		{#if $sensitivityMode === 'global'}
			<div class="row-col">
				<div class="row-head"><span class="row-label">{t('sensitivity.title')}</span><span class="mono">{$minConfidence.toFixed(2)}</span></div>
				<input type="range" min="0" max="100" value={sliderValue} oninput={(event) => setMinConfidence(Number(event.currentTarget.value) / 100)} aria-label={t('sensitivity.aria')} />
				<div class="ticks"><span>{t('sensitivity.fewer')}</span><span>{t('sensitivity.more')}</span></div>
			</div>
		{:else}
			<div class="row">
				<div><div class="row-label">{t('sensitivity.title')}</div><div class="row-meta">{t('popup.settings.individualMode')}</div></div>
				<button type="button" class="select" onclick={openOptions}>{t('popup.settings.options')} ›</button>
			</div>
		{/if}
		<div class="divider"></div>
		<div class="row">
			<div><div class="row-label">{t('popup.settings.nerModel')}</div><div class="row-meta">{t('popup.settings.nerModel.hint')}</div></div>
			<select value={$nerModelChoice} onchange={(event) => setNerModelChoice(event.currentTarget.value)}>
				{#each nerModelChoices as choice (choice.value)}
					<option value={choice.value}>{choice.label}</option>
				{/each}
			</select>
		</div>
		{#if MODEL_SOURCE === 'huggingface'}
			<div class="divider"></div>
			<button type="button" class="link-row" onclick={openModelOptions}>
				<span class="model-info">
					<span class="row-label">{t('system.model')}</span>
					<span class="row-meta">{modelSummary}</span>
				</span>
				<span class="manage">{t('modelCard.manage')} ›</span>
			</button>
		{/if}
	</article>

	<article class="card">
		<div class="head"><span>{t('popup.settings.behavior')}</span></div>
		<div class="row"><div><div class="row-label">{t('popup.settings.interceptCopy')}</div><div class="row-meta">{t('popup.settings.interceptCopy.hint')}</div></div><Toggle size="sm" checked={$clipboardInterceptEnabled} onchange={(checked) => setClipboardInterceptEnabled(checked)} label={t('popup.settings.interceptCopy')} /></div>
		<div class="divider"></div>
		<div class="row"><div><div class="row-label">{t('popup.settings.debug')}</div><div class="row-meta">{t('popup.settings.debug.hint')}</div></div><Toggle size="sm" checked={$debug} onchange={(checked) => setDebug(checked)} label={t('popup.settings.debug')} /></div>
	</article>

	<article class="card">
		<div class="head"><span>{t('popup.settings.maintenance')}</span></div>
		<button type="button" class="link-row" onclick={clearFeedback}><span class="row-label">{t('popup.settings.clearFeedback')}</span><span class="right"><span class="count">{tp('popup.settings.corrections', $feedbackCounts.confirmed)}</span>›</span></button>
		<div class="divider"></div>
		<button type="button" class="link-row" onclick={clearMappings}><span class="row-label">{t('popup.maintenance.clearMappings')}</span><span class="right"><span class="count">{t('common.savedCount', { count: $mappingCount })}</span>›</span></button>
	</article>

	<article class="card">
		<div class="head"><span>{t('support.title')}</span></div>
		<button type="button" class="link-row" onclick={openIssueReport}><span class="row-label">{t('support.reportIssue')}</span><span class="right">›</span></button>
		<div class="divider"></div>
		<button type="button" class="link-row" onclick={openSecurityReport}><span class="row-label">{t('support.reportSecurity')}</span><span class="right">›</span></button>
		<div class="divider"></div>
		<button type="button" class="link-row" onclick={openPrivacySupport}><span class="row-label">{t('support.support')}</span><span class="right">›</span></button>
	</article>

	<LegalCard {openPrivacyPolicy} {openTermsOfUse} {openImpressum} />
	<div class="version-note">Redacto · {$nerModel}</div>
</div>

<style>
	.settings-stack { display: flex; flex-direction: column; gap: 8px; }
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.head { display: flex; justify-content: space-between; padding: 11px 12px; border-bottom: 1px solid var(--color-border); }
	.head span { font-size: 12px; font-weight: 600; }
	.row, .link-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; }
	.link-row { width: 100%; border: 0; background: transparent; color: var(--color-ink); cursor: pointer; }
	.row-col { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
	.row-head, .ticks { display: flex; justify-content: space-between; }
	.row-label { font-size: 13px; font-weight: 500; }
	.row-meta, .ticks { color: var(--color-muted); font-size: 11px; }
	.mono, .count { color: var(--color-accent); font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
	.count { color: var(--color-muted); font-size: 11px; }
	input { width: 100%; accent-color: var(--color-accent); }
	select, .select { display: flex; align-items: center; gap: 6px; max-width: 180px; padding: 5px 10px; border: 0; border-radius: var(--radius-sm); background: var(--color-muted-bg); color: var(--color-ink); font-size: 12px; font-weight: 500; cursor: pointer; }
	.divider { height: 1px; background: var(--color-border); }
	.right { display: flex; align-items: center; gap: 8px; }
	.model-info { display: flex; flex-direction: column; min-width: 0; text-align: left; }
	.model-info .row-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.manage { flex-shrink: 0; color: var(--color-accent); font-size: 12px; font-weight: 500; }
	.version-note { padding: 4px 0 8px; color: var(--color-subtle); font-family: var(--font-mono); font-size: 10px; text-align: center; }
</style>
