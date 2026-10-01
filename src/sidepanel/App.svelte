<script lang="ts">
	import { onMount } from 'svelte';
	import {
		HISTORY_STORAGE_KEY,
		bestHistoryMatch,
		clearAnonymizationHistory,
		deleteHistoryEntry,
		loadAnonymizationHistory,
		type HistoryEntry,
	} from '../shared/anonymization-history';
	import { emptyVaultData, loadIdentityVault, type IdentityVaultData } from '../shared/identity-vault';
	import type { Settings } from '../shared/message-types';
	import { loadSettings } from '../shared/storage';
	import ModelDownloadStatus from '../popup/components/ModelDownloadStatus.svelte';
	import PGLogo from '../popup/components/PGLogo.svelte';
	import PrefsControls from '../popup/components/PrefsControls.svelte';
	import { t } from '../shared/i18n/reactive';
	import type { MessageKey } from '../shared/i18n';
	import AnonymizeTab from './components/AnonymizeTab.svelte';
	import HistoryTab from './components/HistoryTab.svelte';
	import SettingsTab from './components/SettingsTab.svelte';
	import { onAnonymizeRequest, type ExternalAnonymizeRequest } from './external-input';

	/** The web page and the IDE panels have no options page of their own, so they show the settings as a tab. */
	let { settingsTab }: { settingsTab?: 'web' | 'ide' } = $props();

	type TabId = 'history' | 'anonymize' | 'settings';
	const tabs: Array<{ id: TabId; label: MessageKey }> = $derived([
		{ id: 'history', label: 'panel.tab.history' },
		{ id: 'anonymize', label: 'panel.tab.anonymize' },
		...(settingsTab ? [{ id: 'settings' as const, label: 'panel.tab.settings' as const }] : []),
	]);

	let activeTab = $state<TabId>('history');
	let settings = $state.raw<Settings | null>(null);
	let vault = $state.raw<IdentityVaultData>(emptyVaultData());
	let entries = $state.raw<HistoryEntry[]>([]);
	let selectedId = $state<string | null>(null);
	/**
	 * True once the user clicks an entry. Until then the selection is picked
	 * for them: the entry whose tokens the pasted text contains, or the newest
	 * one while there is nothing to go by.
	 */
	let pinnedByUser = $state(false);
	let restoreInput = $state('');
	/** The last selection an IDE plugin handed over, if any. */
	let external = $state.raw<ExternalAnonymizeRequest | null>(null);

	const vaultEnabled = $derived(settings?.identityVaultEnabled ?? false);

	function autoSelect(): void {
		if (pinnedByUser) return;
		const match = restoreInput.trim() ? bestHistoryMatch(restoreInput, entries, vault, vaultEnabled) : null;
		selectedId = match?.id ?? entries[0]?.id ?? null;
	}

	async function refreshHistory(): Promise<void> {
		entries = await loadAnonymizationHistory();
		if (!entries.some((entry) => entry.id === selectedId)) pinnedByUser = false;
		autoSelect();
	}

	async function refreshVault(): Promise<void> {
		vault = settings?.identityVaultEnabled ? await loadIdentityVault() : emptyVaultData();
	}

	async function refreshSettings(): Promise<void> {
		settings = await loadSettings();
		await refreshVault();
	}

	function select(id: string): void {
		selectedId = id;
		pinnedByUser = true;
	}

	function selectAutomatically(): void {
		pinnedByUser = false;
		autoSelect();
	}

	function onRestoreInput(value: string): void {
		restoreInput = value;
		// Emptying the box starts over; a choice made for the last text says
		// nothing about the next one.
		if (!value.trim()) pinnedByUser = false;
		autoSelect();
	}

	/** Text just copied from the Anonymize tab is what the next reply answers. */
	function selectSaved(id: string): void {
		selectedId = id;
		pinnedByUser = false;
	}

	onMount(() => {
		void refreshSettings().then(refreshHistory);

		const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
			if (changes[HISTORY_STORAGE_KEY]) void refreshHistory();
			if (area !== 'local') return;
			if (changes['pg_settings']) void refreshSettings();
			else if (changes['pg_identity_vault']) void refreshVault();
		};
		chrome.storage.onChanged.addListener(onChanged);
		const offRequest = onAnonymizeRequest((request) => {
			external = request;
			activeTab = 'anonymize';
		});
		return () => {
			chrome.storage.onChanged.removeListener(onChanged);
			offRequest();
		};
	});
</script>

<main class="panel" class:web={settingsTab === 'web'} aria-label={t('panel.aria')}>
	<header class="panel-header">
		<div class="brand-row">
			<div class="logo"><PGLogo size={settingsTab === 'web' ? 34 : 26} gradId="pg-sidepanel-logo" /></div>
			<div class="brand-copy">
				<h1>Redacto</h1>
				{#if settingsTab === 'web'}<p>{t('web.tagline')}</p>{/if}
			</div>
			<PrefsControls showTheme={settingsTab !== 'ide'} />
		</div>
		<nav class="tab-nav" aria-label={t('panel.tabs.aria')}>
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					class:active={activeTab === tab.id}
					aria-current={activeTab === tab.id ? 'page' : undefined}
					onclick={() => (activeTab = tab.id)}
				>
					{t(tab.label)}
				</button>
			{/each}
		</nav>
	</header>

	<ModelDownloadStatus />

	<!-- The tabs stay mounted so switching keeps what was typed in each. -->
	<section class="panel-body" hidden={activeTab !== 'history'}>
		<HistoryTab
			{entries}
			{selectedId}
			{vault}
			{vaultEnabled}
			{restoreInput}
			autoPicked={!pinnedByUser}
			onrestoreinput={onRestoreInput}
			onauto={selectAutomatically}
			onselect={select}
			ondelete={(id) => void deleteHistoryEntry(id)}
			onclear={() => void clearAnonymizationHistory()}
		/>
	</section>
	<section class="panel-body" hidden={activeTab !== 'anonymize'}>
		<AnonymizeTab {settings} {vault} {external} onsaved={selectSaved} />
	</section>
	{#if settingsTab}
		<section class="panel-body" hidden={activeTab !== 'settings'}>
			<SettingsTab host={settingsTab} />
		</section>
	{/if}
</main>

<style>
	:global(html),
	:global(body),
	:global(#app) {
		height: 100%;
		margin: 0;
	}
	:global(body) {
		font-family: var(--font-sans);
		background: var(--color-surface);
		color: var(--color-ink);
		-webkit-font-smoothing: antialiased;
	}

	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-width: 0;
	}
	.panel-header {
		position: sticky;
		top: 0;
		z-index: 2;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 12px 10px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-chrome);
		backdrop-filter: saturate(160%) blur(12px);
		color: var(--color-ink);
	}
	.brand-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.logo {
		display: grid;
		flex-shrink: 0;
		filter: drop-shadow(0 4px 10px rgb(79 70 229 / 25%));
	}
	.brand-copy {
		flex: 1;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.3px;
		white-space: nowrap;
	}
	.brand-copy p {
		margin: 1px 0 0;
		overflow: hidden;
		color: var(--color-muted);
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tab-nav {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--color-muted-bg);
	}
	.tab-nav button {
		flex: 1;
		padding: 6px 8px;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--color-muted);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		transition: color 120ms ease, background 120ms ease;
	}
	.tab-nav button:hover {
		color: var(--color-ink);
	}
	.tab-nav button.active {
		background: var(--color-elevated);
		color: var(--color-ink);
		font-weight: 600;
		box-shadow: var(--shadow-sm), 0 0 0 1px var(--color-border);
	}
	.tab-nav button:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus);
	}
	.panel-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 12px 12px 18px;
	}
	.panel-body[hidden] {
		display: none;
	}

	/* The web page: a wider, roomier layout. */
	.panel.web .panel-header {
		gap: 14px;
		padding: 18px 20px 14px;
	}
	.panel.web h1 {
		font-size: 20px;
	}
	.panel.web .tab-nav {
		align-self: flex-start;
		max-width: 100%;
	}
	.panel.web .tab-nav button {
		flex: 0 1 auto;
		padding: 7px 18px;
	}
	.panel.web .panel-body {
		padding: 16px 20px 24px;
	}
	@media (max-width: 520px) {
		.panel.web .panel-header { padding: 14px 16px 12px; }
		.panel.web .panel-body { padding: 12px 16px 20px; }
		.panel.web .brand-copy p { display: none; }
		.panel.web .tab-nav { align-self: stretch; }
		.panel.web .tab-nav button { flex: 1; padding: 6px 8px; }
	}
</style>
