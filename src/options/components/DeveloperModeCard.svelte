<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Writable } from 'svelte/store';
	import type { Settings } from '../../shared/message-types';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import DeveloperModeSetting from '../../ui/dev/DeveloperModeSetting.svelte';
	import DevDetectionPanel from '../../ui/dev/DevDetectionPanel.svelte';
	import { detectForPanel, type PanelDetection } from '../../sidepanel/panel-anonymizer';
	import { copyText } from '../../sidepanel/clipboard';

	let {
		settings,
		setDeveloper,
	}: {
		settings: Writable<Settings | null>;
		setDeveloper: (partial: Partial<Pick<Settings, 'developerMode' | 'devUseNer' | 'devUseRegex'>>) => Promise<void>;
	} = $props();

	let sample = $state('');
	let running = $state(false);
	let error = $state('');
	let detection = $state.raw<PanelDetection | null>(null);

	async function run(): Promise<void> {
		const current = $settings;
		if (!current || !sample.trim() || running) return;
		running = true;
		error = '';
		try {
			detection = await detectForPanel(sample, current);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			running = false;
		}
	}
</script>

<article class="card" id="developer-mode-section">
	<CardHeading title={t('dev.tools.title')} hint={t('dev.tools.hint')} />
	<DeveloperModeSetting
		developerMode={$settings?.developerMode ?? false}
		devUseNer={$settings?.devUseNer ?? true}
		devUseRegex={$settings?.devUseRegex ?? true}
		save={setDeveloper}
		spacious
	/>
	{#if $settings?.developerMode}
		<div class="body">
			<textarea bind:value={sample} placeholder={t('dev.tools.placeholder')} aria-label={t('dev.tools.title')}></textarea>
			<button type="button" class="run" disabled={running || !sample.trim()} onclick={run}>
				{running ? t('common.detecting') : t('dev.tools.run')}
			</button>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			{#if detection?.devDiagnostics}
				<DevDetectionPanel diagnostics={detection.devDiagnostics} spans={detection.spans} copy={copyText} />
			{/if}
		</div>
	{/if}
</article>

<style>
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); box-shadow: var(--shadow-sm); }
	.body { display: flex; flex-direction: column; gap: 10px; padding: 0 14px 14px; }
	textarea {
		box-sizing: border-box; width: 100%; min-height: 90px; padding: 10px; resize: vertical;
		border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); outline: none;
		background: var(--color-input); color: var(--color-ink); font: 12px/1.5 var(--font-mono);
	}
	textarea:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-focus); }
	.run {
		align-self: flex-start; padding: 8px 18px; border: 0; border-radius: var(--radius-sm);
		background: var(--color-accent); color: var(--color-on-accent); font-size: 12px; font-weight: 600; cursor: pointer;
	}
	.run:disabled { cursor: not-allowed; opacity: 0.55; }
	.error { margin: 0; color: var(--color-danger); font-size: 12px; }
</style>
