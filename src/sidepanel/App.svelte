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
	import PGLogo from '../popup/components/PGLogo.svelte';
	import AnonymizeTab from './components/AnonymizeTab.svelte';
	import HistoryTab from './components/HistoryTab.svelte';
	import SettingsTab from './components/SettingsTab.svelte';
	import { onAnonymizeRequest, type ExternalAnonymizeRequest } from './external-input';

	/** The web page has no options page of its own, so it shows the settings as a tab. */
	let { settingsTab = false }: { settingsTab?: boolean } = $props();

	type TabId = 'history' | 'anonymize' | 'settings';
	const tabs: Array<{ id: TabId; label: string }> = $derived([
		{ id: 'history', label: 'History & restore' },
		{ id: 'anonymize', label: 'Anonymize' },
		...(settingsTab ? [{ id: 'settings' as const, label: 'Settings' }] : []),
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

<main class="panel" aria-label="Privacy Guardrail side panel">
	<header class="panel-header">
		<div class="brand-row">
			<PGLogo size={22} gradId="pg-sidepanel-logo" />
			<h1>Privacy Guardrail</h1>
		</div>
		<nav class="tab-nav" aria-label="Side panel sections">
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					class:active={activeTab === tab.id}
					aria-current={activeTab === tab.id ? 'page' : undefined}
					onclick={() => (activeTab = tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</header>

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
			<SettingsTab />
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
	}

	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-width: 0;
	}
	.panel-header {
		flex-shrink: 0;
		background: var(--color-header);
		color: white;
	}
	.brand-row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 10px 14px;
	}
	h1 {
		margin: 0;
		font-size: 15px;
		font-weight: 400;
		letter-spacing: -0.1px;
		white-space: nowrap;
	}
	.tab-nav {
		display: flex;
		border-top: 1px solid rgb(255 255 255 / 6%);
	}
	.tab-nav button {
		flex: 1;
		padding: 10px 8px 11px;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: rgb(255 255 255 / 55%);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}
	.tab-nav button.active {
		border-bottom-color: var(--color-glow);
		box-shadow: inset 0 -14px 28px -11px var(--color-glow);
		color: white;
		font-weight: 600;
	}
	.tab-nav button:focus-visible {
		outline: 2px solid var(--color-glow);
		outline-offset: -2px;
	}
	.panel-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 10px 10px 16px;
	}
	.panel-body[hidden] {
		display: none;
	}
</style>
