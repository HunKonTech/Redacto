<script lang="ts">
	import { t } from '../../shared/i18n/reactive';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import PrefsControls from '../../popup/components/PrefsControls.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';
	import AllowlistCard from '../../options/components/AllowlistCard.svelte';
	import BlocklistCard from '../../options/components/BlocklistCard.svelte';
	import PublicDomainsCard from '../../options/components/PublicDomainsCard.svelte';
	import CodeBlocksCard from '../../options/components/CodeBlocksCard.svelte';
	import SensitivityCard from '../../options/components/SensitivityCard.svelte';
	import VaultCard from '../../options/components/VaultCard.svelte';
	import { createOptionsModel } from '../../options/options-model.svelte';
	import { saveSettings } from '../../shared/storage';

	/**
	 * The settings the web page (GitHub Pages) and the IDE panels use, reusing
	 * the options page's cards. There is no service worker or other tab here,
	 * so the changes are only saved: the storage shim keeps them (localStorage
	 * on the web, the IDE host's storage in an IDE) and the panel picks them up
	 * through `storage.onChanged`.
	 */
	let { host = 'web' }: { host?: 'web' | 'ide' } = $props();
	const inIde = $derived(host === 'ide');

	const model = createOptionsModel();
	const settings = model.settings;

	let localAi = $derived(($settings?.nerProvider ?? 'transformers') !== 'off');
	let debug = $derived($settings?.debug ?? false);
</script>

<div class="stack">
	<article class="card">
		<CardHeading title={t('settings.appearance')} />
		<div class="row">
			<div class="info">
				<span class="row-label">{t('prefs.language')}</span>
				<p class="hint">{t('settings.language.hint')}</p>
			</div>
			<PrefsControls showTheme={!inIde} />
		</div>
	</article>

	<article class="card">
		<CardHeading title={t('settings.detection')} hint={inIde ? t('settings.savedIde') : t('settings.savedBrowser')} />
		<div class="row">
			<div class="info">
				<span class="row-label">{t('settings.localAi')}</span>
				<p class="hint">
					{#if inIde}
						{t('settings.localAi.hintIde')}
					{:else}
						{t('settings.localAi.hintWeb')}
					{/if}
				</p>
			</div>
			<Toggle
				size="sm"
				checked={localAi}
				label={t('settings.localAi')}
				onchange={(checked) => saveSettings({ nerProvider: checked ? 'transformers' : 'off' })}
			/>
		</div>
		<div class="row">
			<div class="info">
				<span class="row-label">{t('settings.debugLogging')}</span>
				<p class="hint">
					{t('settings.debugLogging.hintBefore')}<code>[PG:…]</code>{inIde ? t('settings.debugLogging.hintIde') : t('settings.debugLogging.hintWeb')}
				</p>
			</div>
			<Toggle size="sm" checked={debug} label={t('settings.debugLogging')} onchange={(checked) => saveSettings({ debug: checked })} />
		</div>
	</article>

	<CodeBlocksCard {settings} setValue={model.setSkipCodeBlocks} setCodeAnonymization={model.setCodeAnonymization} />

	<SensitivityCard
		{settings}
		groupNames={model.groupNames}
		setSensitivityMode={model.setSensitivityMode}
		setGlobalThreshold={model.setGlobalThreshold}
		setGroupThreshold={model.setGroupThreshold}
	/>

	<AllowlistCard
		{settings}
		error={model.allowlistError}
		addEntry={model.addAllowlistEntry}
		removeEntry={model.removeAllowlistEntry}
		clearError={model.clearAllowlistError}
	/>

	<PublicDomainsCard
		{settings}
		error={model.publicDomainError}
		addDomain={model.addPublicDomain}
		removeDomain={model.removePublicDomain}
		clearError={model.clearPublicDomainError}
	/>

	<BlocklistCard
		{settings}
		error={model.blocklistError}
		addEntry={model.addBlocklistEntry}
		removeEntry={model.removeBlocklistEntry}
		updateCategory={model.updateBlocklistCategory}
		clearError={model.clearBlocklistError}
	/>

	<VaultCard
		{settings}
		records={model.vaultRecords}
		setVaultEnabled={model.setVaultEnabled}
		setDefaultReplacementMode={model.setDefaultReplacementMode}
		updateRecord={model.updateVaultRecord}
		deleteRecord={model.deleteVaultRecord}
		exportVault={model.exportVault}
		importVault={model.importVault}
		clearUnpinned={model.clearUnpinned}
	/>
</div>

<style>
	.stack { display: flex; flex-direction: column; }
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
