<script lang="ts">
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';
	import AllowlistCard from '../../options/components/AllowlistCard.svelte';
	import BlocklistCard from '../../options/components/BlocklistCard.svelte';
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
		<CardHeading title="Detection" hint={inIde ? 'Saved in this IDE' : 'Saved in this browser'} />
		<div class="row">
			<div class="info">
				<span class="row-label">Local AI detection</span>
				<p class="hint">
					{#if inIde}
						Finds names, addresses and other personal data with the local AI model bundled with the plugin,
						run inside the IDE. When off, only the built-in rules detect.
					{:else}
						Finds names, addresses and other personal data with the local AI model, downloaded from this site
						and run in this browser. When off, only the built-in rules detect.
					{/if}
				</p>
			</div>
			<Toggle
				size="sm"
				checked={localAi}
				label="Local AI detection"
				onchange={(checked) => saveSettings({ nerProvider: checked ? 'transformers' : 'off' })}
			/>
		</div>
		<div class="row">
			<div class="info">
				<span class="row-label">Debug logging</span>
				<p class="hint">
					Writes detection details (<code>[PG:…]</code>) to the {inIde ? 'webview developer tools console' : 'browser console'}.
				</p>
			</div>
			<Toggle size="sm" checked={debug} label="Debug logging" onchange={(checked) => saveSettings({ debug: checked })} />
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
	.card { margin-bottom: 12px; overflow: hidden; border: var(--border-hairline); border-radius: var(--radius-lg); background: var(--color-card); }
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
