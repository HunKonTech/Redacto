<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import type { Settings } from '../../shared/message-types';
	import Toggle from '../../popup/components/Toggle.svelte';

	type DeveloperSettings = Pick<Settings, 'developerMode' | 'devUseNer' | 'devUseRegex'>;

	let {
		developerMode,
		devUseNer,
		devUseRegex,
		save,
		spacious = false,
	}: DeveloperSettings & {
		save: (partial: Partial<DeveloperSettings>) => Promise<void> | void;
		/** Roomier rows for the options page and the web settings. */
		spacious?: boolean;
	} = $props();
</script>

<div class="dev-setting" class:spacious>
	<div class="row">
		<div class="info">
			<div class="row-label">{t('dev.mode')} <span class="badge">{t('dev.badge')}</span></div>
			<div class="row-meta">{t('dev.mode.hint')}</div>
		</div>
		<Toggle size="sm" checked={developerMode} label={t('dev.mode')} onchange={(checked) => save({ developerMode: checked })} />
	</div>
	{#if developerMode}
		<div class="overrides">
			<label>
				<input type="checkbox" checked={devUseNer} onchange={(event) => save({ devUseNer: event.currentTarget.checked })} />
				<span>{t('dev.useNer')}</span>
			</label>
			<label>
				<input type="checkbox" checked={devUseRegex} onchange={(event) => save({ devUseRegex: event.currentTarget.checked })} />
				<span>{t('dev.useRegex')}</span>
			</label>
			<p class="row-meta">{t('dev.overridesHint')}</p>
		</div>
	{/if}
</div>

<style>
	.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; }
	.spacious .row { align-items: flex-start; gap: 16px; padding: 14px; }
	.info { flex: 1; min-width: 0; }
	.row-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; }
	.row-meta { margin: 0; color: var(--color-muted); font-size: 11px; line-height: 1.45; }
	.spacious .row-meta { font-size: 12px; }
	.badge {
		padding: 1px 6px; border-radius: 4px; background: var(--color-muted-bg); color: var(--color-accent);
		font: 600 9.5px/1.5 var(--font-mono); letter-spacing: 0.4px;
	}
	.overrides {
		display: flex; flex-direction: column; gap: 6px;
		margin: 0 12px 12px 24px; padding: 2px 0 2px 12px;
		border-left: 2px solid var(--color-accent);
	}
	.spacious .overrides { margin: 0 14px 14px 26px; }
	label { display: flex; align-items: center; gap: 8px; color: var(--color-ink); font-size: 12px; cursor: pointer; }
	input { margin: 0; accent-color: var(--color-accent); }
</style>
