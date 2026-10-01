<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import {
		huggingFaceRepoUrl,
		isModelDownloadActive,
		MODEL_HF_REPO,
		modelDownloadPercent,
	} from '../../shared/local-ai-model-download';
	import { modelDownloadState, requestModelDelete, requestModelDownload } from '../../shared/model-download-store';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import { modelDownloadedAt, modelDownloadText, modelSize } from '../../popup/components/model-download-text';

	/** Where the extension downloads the Local AI model: when, how big, and download / update / delete by hand. */
	const download = $derived($modelDownloadState);
	const active = $derived(isModelDownloadActive(download));
	const ready = $derived(Boolean(download.readyVersion));
	const percent = $derived(modelDownloadPercent(download));
	let deleting = $state(false);

	async function remove(): Promise<void> {
		if (!confirm(t('modelCard.deleteConfirm'))) return;
		deleting = true;
		try {
			await requestModelDelete();
		} finally {
			deleting = false;
		}
	}
</script>

<article class="card" id="local-ai-model-section" aria-live="polite">
	<CardHeading title={t('system.model')} hint={t('modelCard.hint')} />
	<div class="body">
		<div class={['status', ready && 'ready', download.phase === 'failed' && 'failed']}>
			<span class="dot" aria-hidden="true"></span>
			<span>{modelDownloadText(download)}</span>
		</div>
		{#if active}
			<div
				class="bar"
				role="progressbar"
				aria-label={t('model.progressAria')}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={download.phase === 'downloading' ? percent : undefined}
			>
				<span class:indeterminate={download.phase !== 'downloading'} style:width={download.phase === 'downloading' ? `${percent}%` : undefined}></span>
			</div>
		{/if}

		{#if ready}
			<dl class="facts">
				<div>
					<dt>{t('modelCard.version')}</dt>
					<dd class="mono">{download.readyVersion}</dd>
				</div>
				<div>
					<dt>{t('modelCard.downloadedAt')}</dt>
					<dd>{modelDownloadedAt(download) ?? t('modelCard.notRecorded')}</dd>
				</div>
				<div>
					<dt>{t('modelCard.size')}</dt>
					<dd class="mono">{modelSize(download) ?? '—'}</dd>
				</div>
			</dl>
		{/if}

		<div class="actions">
			{#if ready}
				<button type="button" class="secondary" disabled={active || deleting} onclick={() => requestModelDownload(true)}>
					{t('modelCard.checkUpdates')}
				</button>
				<button type="button" class="secondary danger" disabled={active || deleting} onclick={() => void remove()}>
					{t('modelCard.delete')}
				</button>
			{:else}
				<button type="button" class="primary" disabled={active || deleting} onclick={() => requestModelDownload()}>
					{download.phase === 'failed' ? t('common.tryAgain') : t('modelCard.download')}
				</button>
			{/if}
		</div>

		<p class="hint">{ready ? t('modelCard.deleteHint') : t('modelCard.downloadHint')}</p>
		<p class="hint">
			{t('modelCard.manual')}
			<a href={huggingFaceRepoUrl()} target="_blank" rel="noopener noreferrer">{MODEL_HF_REPO}</a>
		</p>
	</div>
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.body { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
	.status { display: flex; align-items: center; gap: 8px; color: var(--color-ink); font-size: 13px; font-weight: 500; }
	.status.failed { color: var(--color-danger); }
	.dot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--color-toggle-off); }
	.status.ready .dot { background: var(--color-success); box-shadow: 0 0 0 4px rgb(34 197 94 / 16%); }
	.status.failed .dot { background: var(--color-danger); box-shadow: none; }
	.bar { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--color-muted-bg); }
	.bar span { display: block; height: 100%; background: var(--color-accent); transition: width 0.3s ease; }
	.bar span.indeterminate { width: 30%; animation: slide 1.2s ease-in-out infinite; }
	@keyframes slide {
		from { transform: translateX(-100%); }
		to { transform: translateX(340%); }
	}
	.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; }
	.facts div { min-width: 0; padding: 10px 12px; border: var(--border-hairline); border-radius: var(--radius-md); background: var(--color-input); }
	dt { color: var(--color-muted); font-size: 11px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }
	dd { margin: 3px 0 0; overflow: hidden; color: var(--color-ink); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
	.mono { font-family: var(--font-mono); }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
	.primary, .secondary { padding: 8px 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 500; cursor: pointer; }
	.primary { border: 0; background: var(--color-accent); color: var(--color-on-accent); }
	.primary:hover:not(:disabled) { background: var(--color-accent-hover); }
	.secondary { border: 1px solid var(--color-border-strong); background: var(--color-elevated); color: var(--color-ink); }
	.secondary:hover:not(:disabled) { border-color: var(--color-accent); }
	.secondary.danger { color: var(--color-danger); }
	.secondary.danger:hover:not(:disabled) { border-color: var(--color-danger); background: var(--color-danger-soft); }
	button:disabled { cursor: progress; opacity: 0.6; }
	.hint { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	.hint a { color: var(--color-accent); font-family: var(--font-mono); font-size: 11.5px; overflow-wrap: anywhere; }
	@media (max-width: 640px) {
		.facts { grid-template-columns: 1fr; }
	}
</style>
