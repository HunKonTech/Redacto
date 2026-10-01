<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Writable } from 'svelte/store';
	import type { LocalAiUnloadTimeoutMs, Settings, SystemCompatibilityStatus } from '../../shared/message-types';
	import { LOCAL_AI_UNLOAD_TIMEOUT_CHOICES, nerModelChoices, nerModelChoiceValue } from '../../shared/constants';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	let {
		settings,
		status,
		warmupState,
		setLocalAiDetection,
		retryLocalAi,
		rerunSystemCheck,
		setNerModelChoice,
		setLocalAiUnloadTimeoutMs,
		setKeepLocalAiLoadedWhileActive,
		setAutoWarmLocalAiOnActiveSupportedPage,
	}: {
		settings: Writable<Settings | null>;
		status: Writable<SystemCompatibilityStatus | null>;
		warmupState: Writable<'idle' | 'loading' | 'ready' | 'failed'>;
		setLocalAiDetection: (enabled: boolean) => Promise<void>;
		retryLocalAi: () => Promise<void>;
		rerunSystemCheck: () => Promise<void>;
		setNerModelChoice: (value: string) => Promise<void>;
		setLocalAiUnloadTimeoutMs: (value: LocalAiUnloadTimeoutMs) => Promise<void>;
		setKeepLocalAiLoadedWhileActive: (enabled: boolean) => Promise<void>;
		setAutoWarmLocalAiOnActiveSupportedPage: (enabled: boolean) => Promise<void>;
	} = $props();

	let rerunInFlight = $state(false);

	async function handleRerun() {
		if (rerunInFlight) return;
		rerunInFlight = true;
		try {
			await rerunSystemCheck();
		} finally {
			rerunInFlight = false;
		}
	}

	let memoryLabel = $derived.by(() => {
		if (!$status) return t('system.checking');
		return typeof $status.browserMemoryGb === 'number'
			? t('system.memory', { gb: $status.browserMemoryGb })
			: t('system.memoryUnavailable');
	});

	let tierLabel = $derived.by(() => {
		if (!$status) return t('system.tier.checking');
		if ($status.tier === 'critical') return t('system.tier.critical');
		if ($status.tier === 'warning') return t('system.tier.warning');
		if ($status.tier === 'unknown') return t('system.tier.unknown');
		return t('system.tier.ok');
	});

	let localAiLabel = $derived.by(() => {
		if (!$settings) return t('system.localAi.loading');
		if ($settings.nerProvider === 'off') return t('system.localAi.off');
		if ($settings.nerProvider === 'fixture') return t('system.localAi.fixture');
		return t('system.localAi.on');
	});

	let runtimeLabel = $derived.by(() => {
		const runtime = $status?.runtimeState ?? 'unknown';
		if ($warmupState === 'loading') return t('system.runtime.loading');
		if ($warmupState === 'ready') return t('system.runtime.ready');
		if ($warmupState === 'failed') return t('system.runtime.failed');
		if (runtime === 'not-loaded') return t('system.runtime.notLoaded');
		if (runtime === 'unknown') return t('system.runtime.unknown');
		return t('system.runtime.other', { state: runtime });
	});

	let localAiEnabled = $derived($settings?.nerProvider !== 'off');
	let modelPickerDisabled = $derived(!$settings || !localAiEnabled || $warmupState === 'loading');
	let unloadTimeoutValue = $derived(String($settings?.localAiUnloadTimeoutMs ?? 'session'));
	let loadFailureMessage = $derived($status?.loadFailure?.message ?? null);
	let showRetry = $derived(
		($status?.localAiState === 'off-load-failure' || $warmupState === 'failed') && $warmupState !== 'loading',
	);

	const modelChoices = nerModelChoices();
	let modelChoiceValue = $derived(
		nerModelChoiceValue($settings?.nerModel ?? 'bardsai', $settings?.nerWebGpuDtype),
	);

	function timeoutLabel(value: LocalAiUnloadTimeoutMs): string {
		if (value === null) return t('system.unload.session');
		return t('system.unload.minutes', { minutes: Math.round(value / 60000) });
	}

	function parseTimeout(value: string): LocalAiUnloadTimeoutMs {
		return value === 'session' ? null : Number(value) as LocalAiUnloadTimeoutMs;
	}
</script>

<article class="card" id="system-compatibility-section" aria-live="polite">
	<CardHeading title={t('system.title')} hint={t('system.hint')} />
	<div class="body">
		<div class="summary" data-tier={$status?.tier ?? 'loading'}>
			<span class="summary-title">{tierLabel}</span>
			<span class="summary-detail">{memoryLabel}</span>
		</div>

		<div class="local-ai-control">
			<p class="ai-notice" role="note">{t('popup.aiNotice')}</p>

			<div class="toggle-row">
				<div>
					<label for="local-ai-toggle">{t('settings.localAi')}</label>
					<p>
						{t('system.localAi.hint')}
					</p>
				</div>
				<input
					id="local-ai-toggle"
					type="checkbox"
					checked={localAiEnabled}
					disabled={!$settings || $warmupState === 'loading'}
					onchange={(event) => setLocalAiDetection(event.currentTarget.checked)}
				/>
			</div>

			<label class="model-label" for="local-ai-model">{t('system.model')}</label>
			<select
				id="local-ai-model"
				value={modelChoiceValue}
				disabled={modelPickerDisabled}
				onchange={(event) => setNerModelChoice(event.currentTarget.value)}
			>
				{#each modelChoices as choice (choice.value)}
					<option value={choice.value}>{choice.label}</option>
				{/each}
			</select>
			<p class="hint">
				{t('system.model.hint')}
			</p>
			{#if $warmupState === 'loading'}
				<p class="hint">{t('system.loadingLocalAi')}</p>
			{/if}
			{#if showRetry}
				<div class="failure" role="status">
					<p class="failure-title">{t('system.failed')}</p>
					{#if loadFailureMessage}
						<p class="failure-detail">{loadFailureMessage}</p>
					{:else}
						<p class="failure-detail">{t('system.patternActive')}</p>
					{/if}
					<button type="button" class="retry" onclick={() => retryLocalAi()}>{t('system.retry')}</button>
				</div>
			{/if}

			<div class="runtime-controls">
				<label class="model-label" for="local-ai-unload-timeout">{t('system.unload')}</label>
				<select
					id="local-ai-unload-timeout"
					value={unloadTimeoutValue}
					disabled={!$settings}
					onchange={(event) => setLocalAiUnloadTimeoutMs(parseTimeout(event.currentTarget.value))}
				>
					{#each LOCAL_AI_UNLOAD_TIMEOUT_CHOICES as timeout (String(timeout))}
						<option value={timeout === null ? 'session' : String(timeout)}>{timeoutLabel(timeout)}</option>
					{/each}
				</select>
				<label class="checkbox-row">
					<input
						type="checkbox"
						checked={$settings?.keepLocalAiLoadedWhileActive ?? true}
						disabled={!$settings}
						onchange={(event) => setKeepLocalAiLoadedWhileActive(event.currentTarget.checked)}
					/>
					<span>{t('system.keepLoaded')}</span>
				</label>
				<label class="checkbox-row">
					<input
						type="checkbox"
						checked={$settings?.autoWarmLocalAiOnActiveSupportedPage ?? false}
						disabled={!$settings || !localAiEnabled}
						onchange={(event) => setAutoWarmLocalAiOnActiveSupportedPage(event.currentTarget.checked)}
					/>
					<span>{t('system.autoWarm')}</span>
				</label>
			</div>
		</div>

		<div class="grid">
			<div>
				<span class="label">{t('system.localAiStatus')}</span>
				<strong>{localAiLabel}</strong>
			</div>
			<div>
				<span class="label">{t('system.runtimeStatus')}</span>
				<strong>{runtimeLabel}</strong>
			</div>
			<div>
				<span class="label">{t('system.webGpu')}</span>
				<strong>{$status?.webGpu ?? t('system.webGpu.checking')}</strong>
			</div>
		</div>

		{#if $status?.notes?.length}
			<ul class="notes" aria-label={t('system.notesAria')}>
				{#each $status.notes as note (note)}
					<li>{note}</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">{t('system.pending')}</p>
		{/if}

		<div class="actions">
			<button type="button" class="rerun" onclick={handleRerun} disabled={rerunInFlight}>
				{rerunInFlight ? t('system.rerunning') : t('system.rerun')}
			</button>
			<p class="hint">{t('system.rerun.hint')}</p>
		</div>
	</div>
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.body { padding: 14px; }
	.summary { display: flex; flex-direction: column; gap: 3px; padding: 12px; border-radius: var(--radius-md); background: var(--color-surface); border: var(--border-hairline); }
	.summary[data-tier='critical'] { border-color: rgb(239 68 68 / 55%); }
	.summary[data-tier='warning'], .summary[data-tier='unknown'] { border-color: rgb(245 158 11 / 55%); }
	.summary[data-tier='ok'] { border-color: rgb(34 197 94 / 45%); }
	.summary-title { font-size: 13px; font-weight: 600; }
	.summary-detail, .label, .hint, .notes { color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	.local-ai-control { margin-top: 12px; padding: 12px; border: var(--border-hairline); border-radius: var(--radius-md); }
	.ai-notice { margin: 0 0 12px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--color-surface); border: var(--border-hairline); color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	.toggle-row { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
	.toggle-row label, .model-label { display: block; font-size: 13px; font-weight: 600; }
	.toggle-row p { margin: 4px 0 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
	input[type='checkbox'] { width: 18px; height: 18px; flex: 0 0 auto; accent-color: var(--color-accent); }
	.model-label { margin-top: 12px; }
	select { width: 100%; margin-top: 6px; padding: 8px; border: var(--border-hairline); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-ink); }
	select:disabled { opacity: 0.7; }
	.runtime-controls { margin-top: 12px; padding-top: 10px; border-top: var(--border-hairline); }
	.checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--color-ink); font-size: 12px; line-height: 1.4; }
	.checkbox-row input { width: 16px; height: 16px; margin: 0; flex: 0 0 auto; accent-color: var(--color-accent); }
	.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
	.grid > div { min-width: 0; }
	.label { display: block; margin-bottom: 2px; }
	strong { display: block; font-size: 12px; font-weight: 600; }
	strong::first-letter { text-transform: uppercase; }
	.notes { margin: 12px 0 0; padding-left: 18px; }
	.notes li + li { margin-top: 4px; }
	.hint { margin: 12px 0 0; }
	.failure { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid rgb(239 68 68 / 55%); background: var(--color-danger-soft); }
	.failure-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--color-danger); }
	.failure-detail { margin: 4px 0 8px; font-size: 12px; line-height: 1.5; color: var(--color-muted); }
	.retry { padding: 6px 12px; border-radius: var(--radius-sm); border: var(--border-hairline); background: var(--color-surface); color: var(--color-ink); font-size: 12px; cursor: pointer; }
	.retry:hover { border-color: var(--color-accent); }
	.actions { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; padding-top: 12px; border-top: var(--border-hairline); align-items: flex-start; }
	.actions .hint { margin: 0; }
	.rerun { padding: 6px 12px; border-radius: var(--radius-sm); border: var(--border-hairline); background: var(--color-surface); color: var(--color-ink); font-size: 12px; cursor: pointer; }
	.rerun:hover:not(:disabled) { border-color: var(--color-accent); }
	.rerun:disabled { cursor: progress; opacity: 0.7; }
	@media (max-width: 640px) {
		.grid { grid-template-columns: 1fr; }
	}
</style>
