<script lang="ts">
	import { onMount } from 'svelte';
	import PGLogo from '../popup/components/PGLogo.svelte';
	import PrefsControls from '../popup/components/PrefsControls.svelte';
	import { t } from '../shared/i18n/reactive';
	import { createOptionsModel } from './options-model.svelte';
	import AllowlistCard from './components/AllowlistCard.svelte';
	import PublicDomainsCard from './components/PublicDomainsCard.svelte';
	import BlocklistCard from './components/BlocklistCard.svelte';
	import CancelDetectionCard from './components/CancelDetectionCard.svelte';
	import CodeBlocksCard from './components/CodeBlocksCard.svelte';
	import SearchProtectionCard from './components/SearchProtectionCard.svelte';
	import DebugSystemCheckCard from './components/DebugSystemCheckCard.svelte';
	import LocalAiModelCard from './components/LocalAiModelCard.svelte';
	import { MODEL_SOURCE } from '../shared/local-ai-model-download';
	import PublicSupportCard from './components/PublicSupportCard.svelte';
	import SensitivityCard from './components/SensitivityCard.svelte';
	import SystemCompatibilityCard from './components/SystemCompatibilityCard.svelte';
	import VaultCard from './components/VaultCard.svelte';

	const model = createOptionsModel();
	let allowlistCard: AllowlistCard | undefined = $state();

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const prefill = params.get('allowlist');
		if (prefill) {
			queueMicrotask(() => {
				allowlistCard?.prefill(prefill);
				document.getElementById('allowlist-section')?.scrollIntoView({ behavior: 'smooth' });
			});
		}
		const hash = window.location.hash.replace(/^#/, '');
		if (hash) {
			requestAnimationFrame(() => {
				document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}
	});
</script>

<div class="page">
	<header class="page-header">
		<div class="brand-row">
			<div class="logo-box"><PGLogo size={36} /></div>
			<div class="brand-copy">
				<h1>Redacto <span class="beta-badge" title={t('common.beta.title')}>{t('common.beta')}</span></h1>
				<p>{t('options.subtitle')}</p>
			</div>
			<PrefsControls />
		</div>
	</header>

	<main class="content">
		<SystemCompatibilityCard
			settings={model.settings}
			status={model.systemCompatibility}
			warmupState={model.localAiWarmupState}
			setLocalAiDetection={model.setLocalAiDetection}
			retryLocalAi={model.retryLocalAi}
			rerunSystemCheck={model.rerunSystemCheck}
			setNerModelChoice={model.setNerModelChoice}
			setLocalAiUnloadTimeoutMs={model.setLocalAiUnloadTimeoutMs}
			setKeepLocalAiLoadedWhileActive={model.setKeepLocalAiLoadedWhileActive}
			setAutoWarmLocalAiOnActiveSupportedPage={model.setAutoWarmLocalAiOnActiveSupportedPage}
		/>

		{#if MODEL_SOURCE === 'huggingface'}
			<LocalAiModelCard />
		{/if}

		<SensitivityCard
			settings={model.settings}
			groupNames={model.groupNames}
			setSensitivityMode={model.setSensitivityMode}
			setGlobalThreshold={model.setGlobalThreshold}
			setGroupThreshold={model.setGroupThreshold}
		/>

		<AllowlistCard
			bind:this={allowlistCard}
			settings={model.settings}
			error={model.allowlistError}
			addEntry={model.addAllowlistEntry}
			removeEntry={model.removeAllowlistEntry}
			clearError={model.clearAllowlistError}
		/>

		<PublicDomainsCard
			settings={model.settings}
			error={model.publicDomainError}
			addDomain={model.addPublicDomain}
			removeDomain={model.removePublicDomain}
			clearError={model.clearPublicDomainError}
		/>

		<BlocklistCard
			settings={model.settings}
			error={model.blocklistError}
			addEntry={model.addBlocklistEntry}
			removeEntry={model.removeBlocklistEntry}
			updateCategory={model.updateBlocklistCategory}
			clearError={model.clearBlocklistError}
		/>

		<VaultCard
			settings={model.settings}
			records={model.vaultRecords}
			setVaultEnabled={model.setVaultEnabled}
			setDefaultReplacementMode={model.setDefaultReplacementMode}
			updateRecord={model.updateVaultRecord}
			deleteRecord={model.deleteVaultRecord}
			exportVault={model.exportVault}
			importVault={model.importVault}
			clearUnpinned={model.clearUnpinned}
		/>

		<CancelDetectionCard settings={model.settings} setValue={model.setCancelDetectionBehavior} />

		<CodeBlocksCard
			settings={model.settings}
			setValue={model.setSkipCodeBlocks}
			setCodeAnonymization={model.setCodeAnonymization}
		/>

		<SearchProtectionCard settings={model.settings} setValue={model.setSearchProtectionEnabled} />

		<PublicSupportCard />

		<DebugSystemCheckCard
			settings={model.settings}
			status={model.systemCompatibility}
			setDebug={model.setDebug}
			applyScenario={model.applyDebugSystemCheckScenario}
			clearOverride={model.clearDebugSystemCheck}
		/>
	</main>
</div>

<style>
	:global(html), :global(body) {
		margin: 0;
		min-height: 100vh;
		background: var(--color-surface);
		color: var(--color-ink);
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
	}

	.page {
		max-width: 800px;
		margin: 0 auto;
		padding: 0 0 64px;
	}

	.page-header {
		position: sticky;
		top: 0;
		z-index: 2;
		margin-bottom: 20px;
		padding: 16px 24px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-chrome);
		backdrop-filter: saturate(160%) blur(12px);
	}
	@media (min-width: 848px) {
		.page-header {
			margin-top: 16px;
			border: 1px solid var(--color-border);
			border-radius: var(--radius-lg);
			box-shadow: var(--shadow-md);
		}
	}

	.brand-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.logo-box {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		filter: drop-shadow(0 4px 10px rgb(79 70 229 / 25%));
	}
	.brand-copy { flex: 1; min-width: 0; }
	.brand-copy h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.4px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.beta-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--color-accent-soft);
		color: var(--color-accent);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.6px;
		line-height: 1.4;
		text-transform: uppercase;
	}
	.brand-copy p {
		margin: 2px 0 0;
		color: var(--color-muted);
		font-size: 12.5px;
	}

	.content { padding: 0 24px; }
	/* Sections linked to (#vault-section, …) land below the sticky header. */
	.content :global(article[id]) { scroll-margin-top: 112px; }
	@media (max-width: 520px) {
		.page-header { padding: 12px 16px; }
		.content { padding: 0 16px; }
	}
</style>
