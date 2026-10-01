<script lang="ts">
	import { date, t, time } from '../shared/i18n/reactive';
	import { formatMegabytes } from '../shared/local-ai-model-download';
	import { offlineModelStatus, runOfflineModelTask } from './offline-model';
	import CardHeading from '../popup/components/CardHeading.svelte';

	/**
	 * The web page's offline copy of the local AI model: when it was saved,
	 * how much space it takes, and save / update from this site / delete.
	 */
	const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
	const status = $derived($offlineModelStatus);
	const busy = $derived(status?.busy);
	const complete = $derived(Boolean(status && status.modelFiles > 0 && status.modelFilesCached === status.modelFiles));
	const partial = $derived(Boolean(status && status.modelFilesCached > 0 && !complete));
	const percent = $derived(
		status?.totalBytes ? Math.min(100, Math.floor(((status.cachedBytes ?? 0) / status.totalBytes) * 100)) : 0,
	);

	const statusText = $derived.by((): string => {
		if (!supported) return t('web.offline.unsupported');
		if (!status) return t('webModel.checking');
		if (busy === 'delete-models') return t('web.offline.deleting');
		if (busy) return t('webModel.saving', { percent });
		if (status.error) return t('model.failed', { error: status.error });
		if (complete) return t('webModel.saved');
		if (partial) return t('webModel.partial', { cached: status.modelFilesCached, total: status.modelFiles });
		return t('webModel.notSaved');
	});

	const savedAt = $derived(
		status?.cachedAt
			? `${date(status.cachedAt, { year: 'numeric', month: 'short', day: 'numeric' })} ${time(status.cachedAt, { hour: '2-digit', minute: '2-digit' })}`
			: null,
	);

	function remove(): void {
		if (confirm(t('webModel.deleteConfirm'))) void runOfflineModelTask('delete-models');
	}
</script>

<article class="card" id="local-ai-model-section" aria-live="polite">
	<CardHeading title={t('system.model')} hint={t('webModel.hint')} />
	<div class="body">
		<div class={['status', complete && !busy && 'ready', status?.error && !busy && 'failed']}>
			<span class="dot" aria-hidden="true"></span>
			<span>{statusText}</span>
		</div>
		{#if busy && busy !== 'delete-models'}
			<div class="bar" role="progressbar" aria-label={t('model.progressAria')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
				<span style:width={`${percent}%`}></span>
			</div>
		{/if}

		{#if status && (complete || partial)}
			<dl class="facts">
				<div>
					<dt>{t('modelCard.version')}</dt>
					<dd class="mono" title={status.modelVersion}>{status.siteVersion ?? '—'}</dd>
				</div>
				<div>
					<dt>{t('webModel.savedAt')}</dt>
					<dd>{savedAt ?? t('modelCard.notRecorded')}</dd>
				</div>
				<div>
					<dt>{t('modelCard.size')}</dt>
					<dd class="mono">
						{complete
							? formatMegabytes(status.cachedBytes ?? 0)
							: t('webModel.sizeOf', { cached: formatMegabytes(status.cachedBytes ?? 0), total: formatMegabytes(status.totalBytes ?? 0) })}
					</dd>
				</div>
			</dl>
		{/if}

		{#if supported}
			<div class="actions">
				{#if !complete}
					<button type="button" class="primary" disabled={!status || Boolean(busy)} onclick={() => void runOfflineModelTask('cache-models')}>
						{t('webModel.save')}
					</button>
				{/if}
				{#if complete || partial}
					<button type="button" class="secondary" disabled={Boolean(busy)} onclick={() => void runOfflineModelTask('refresh-models')}>
						{t('webModel.refresh')}
					</button>
					<button type="button" class="secondary danger" disabled={Boolean(busy)} onclick={remove}>
						{t('modelCard.delete')}
					</button>
				{/if}
			</div>
			<p class="hint">{t('webModel.hintOnline')}</p>
			{#if complete || partial}
				<p class="hint">{t('webModel.refreshHint')}</p>
			{/if}
		{/if}
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
	@media (max-width: 640px) {
		.facts { grid-template-columns: 1fr; }
	}
</style>
