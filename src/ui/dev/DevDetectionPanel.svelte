<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { DevDiagnostics, PiiSpan } from '../../shared/message-types';
	import { modelDownloadState } from '../../shared/model-download-store';
	import { formatMegabytes } from '../../shared/local-ai-model-download';
	import {
		chunkText,
		deviceText,
		heapText,
		rawItemCount,
		rawOutputJson,
		sourceSummary,
		spansJson,
		timingText,
	} from './format-dev-diagnostics';

	let {
		diagnostics,
		spans,
		copy,
	}: {
		diagnostics: DevDiagnostics;
		/** The spans the review starts from. */
		spans: readonly PiiSpan[];
		copy: (text: string) => Promise<void>;
	} = $props();

	let copied = $state<'raw' | 'spans' | null>(null);
	let copyError = $state('');
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;

	const na = $derived(t('dev.panel.na'));
	const rawJson = $derived(rawOutputJson(diagnostics));
	const ranModel = $derived(diagnostics.rawNerOutput !== undefined);
	const modelFile = $derived($modelDownloadState.readyBytes ? formatMegabytes($modelDownloadState.readyBytes) : null);
	const metrics = $derived([
		{ label: t('dev.panel.model'), value: diagnostics.nerEnabled ? (diagnostics.model?.label ?? na) : t('dev.panel.notLoaded') },
		{ label: t('dev.panel.device'), value: deviceText(diagnostics.model) ?? na },
		{ label: t('dev.panel.modelFile'), value: modelFile ?? na },
		{ label: t('dev.panel.heap'), value: heapText(diagnostics.memory) ?? na, title: t('dev.panel.heap.title') },
		{
			label: t('dev.panel.timing'),
			value: timingText(diagnostics.timings) ?? na,
			title: diagnostics.timings?.wasCold ? t('dev.panel.cold') : undefined,
		},
		{ label: t('dev.panel.chunks'), value: chunkText(diagnostics) ?? na },
	]);

	async function copyPart(part: 'raw' | 'spans'): Promise<void> {
		copyError = '';
		try {
			await copy(part === 'raw' ? rawJson : spansJson(spans));
			copied = part;
			if (copiedTimer) clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = null), 1800);
		} catch (err) {
			copyError = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<article class="card dev-card">
	<div class="head">
		<span class="title">{t('dev.panel.title')} <span class="badge">{t('dev.badge')}</span></span>
		<span class="switches">
			LLM {diagnostics.nerEnabled ? t('dev.panel.on') : t('dev.panel.off')} · Regex {diagnostics.regexEnabled ? t('dev.panel.on') : t('dev.panel.off')}
		</span>
	</div>
	<div class="grid">
		{#each metrics as metric (metric.label)}
			<div class="metric" title={metric.title ?? metric.value}>
				<span class="label">{metric.label}</span>
				<span class="value">{metric.value}</span>
			</div>
		{/each}
	</div>
	<div class="body">
		{#if diagnostics.error}
			<p class="error" role="alert">{t('dev.panel.error', { message: diagnostics.error })}</p>
		{/if}
		<div class="meta-row">
			<span>
				{#if ranModel}
					{t('dev.panel.raw', { chunks: diagnostics.rawNerOutput?.length ?? 0, items: rawItemCount(diagnostics) })}
				{:else}
					{t('dev.panel.noRaw')}
				{/if}
			</span>
			<span>{t('dev.panel.spans', { summary: sourceSummary(diagnostics.spanCountsBySource) })}</span>
		</div>
		{#if diagnostics.nerInputView === 'identifier-split'}
			<p class="note">{t('dev.panel.rawSplitView')}</p>
		{/if}
		{#if ranModel}
			<pre class="raw">{rawJson}</pre>
		{/if}
		<div class="actions">
			{#if ranModel}
				<button type="button" onclick={() => copyPart('raw')}>
					{copied === 'raw' ? t('dev.panel.copied') : t('dev.panel.copyRaw')}
				</button>
			{/if}
			<button type="button" onclick={() => copyPart('spans')}>
				{copied === 'spans' ? t('dev.panel.copied') : t('dev.panel.copySpans')}
			</button>
		</div>
		{#if copyError}
			<p class="error" role="alert">{copyError}</p>
		{/if}
	</div>
</article>

<style>
	.card { overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.head {
		display: flex; align-items: center; justify-content: space-between; gap: 10px;
		padding: 12px 14px 10px; border-bottom: 1px solid var(--color-border);
	}
	.title { display: flex; align-items: center; gap: 6px; color: var(--color-ink); font-size: 12.5px; font-weight: 600; }
	.badge {
		padding: 1px 6px; border-radius: 4px; background: var(--color-muted-bg); color: var(--color-accent);
		font: 600 9.5px/1.5 var(--font-mono); letter-spacing: 0.4px;
	}
	.switches { color: var(--color-muted); font: 600 10.5px var(--font-mono); white-space: nowrap; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; padding: 10px 12px 0; }
	.metric { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 6px 8px; border-radius: var(--radius-sm); background: var(--color-input); }
	.label { color: var(--color-muted); font-size: 10.5px; }
	.value { overflow: hidden; color: var(--color-ink); font: 600 12px var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
	.body { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; }
	.meta-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; color: var(--color-muted); font-size: 11px; }
	.note { margin: 0; color: var(--color-subtle); font-size: 10.5px; line-height: 1.45; }
	.raw {
		box-sizing: border-box; max-height: 260px; margin: 0; padding: 8px 10px; overflow: auto;
		border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-input);
		color: var(--color-ink); font: 11px/1.5 var(--font-mono); white-space: pre; user-select: text;
	}
	.actions { display: flex; flex-wrap: wrap; gap: 6px; }
	.actions button {
		padding: 6px 10px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm);
		background: transparent; color: var(--color-ink); font-size: 11.5px; font-weight: 500; cursor: pointer;
	}
	.actions button:hover { background: var(--color-input); }
	.error { margin: 0; color: var(--color-danger); font-size: 11px; line-height: 1.45; }
</style>
