<script lang="ts">
  import { debugError } from '../shared/debug-log';
  import { t } from '../shared/i18n/reactive';
  import { canOpenSidePanel, openSidePanel as openBrowserSidePanel } from '../shared/side-panel';
  import { createAppModels, tabs } from "./popup-model.svelte";
  import DetectTab from "./components/DetectTab.svelte";
  import ModelDownloadStatus from "./components/ModelDownloadStatus.svelte";
  import PGLogo from "./components/PGLogo.svelte";
  import PrefsControls from "./components/PrefsControls.svelte";
  import ProtectTab from "./components/ProtectTab.svelte";
  import SettingsTab from "./components/SettingsTab.svelte";
  import TestTab from "./components/TestTab.svelte";
  import Toggle from "./components/Toggle.svelte";

  const { navigation, protection, categories, vault, test, settings } = createAppModels();
  const { activeTab, setActiveTab } = navigation;
  const { enabled: protectionEnabled, version, modelLabel } = protection;

  // Looked up ahead of the click: `sidePanel.open` has to run in response to
  // the click itself, before anything is awaited.
  let windowId: number | null = null;
  chrome.windows?.getCurrent().then((win) => { windowId = win.id ?? null; }).catch(() => undefined);

  function openSidePanel(): void {
    if (windowId === null || !canOpenSidePanel()) return;
    openBrowserSidePanel(windowId).then(() => window.close()).catch((err) => {
      debugError('[PG:popup] side panel open failed', err);
    });
  }
</script>

<div class="page-frame">
  <main class="popup-shell" aria-label={t('popup.aria')}>
    <header class="shell-header">
      <div class="brand-row">
        <div class="logo-box"><PGLogo size={30} /></div>
        <div class="brand-copy">
          <h1>Redacto <span class="beta-badge" title={t('common.beta.title')}>{t('common.beta')}</span></h1>
          <p>v{$version}{$modelLabel ? ` · ${$modelLabel}` : ''}</p>
        </div>
        <PrefsControls />
      </div>

      <div class={['master', $protectionEnabled && 'on']}>
        <span class="master-dot" aria-hidden="true"></span>
        <div class="master-copy">
          <strong>{$protectionEnabled ? t('popup.master.on') : t('popup.master.off')}</strong>
          <span>{$protectionEnabled ? t('popup.master.onHint') : t('popup.master.offHint')}</span>
        </div>
        <Toggle
          checked={$protectionEnabled}
          label={t('popup.master.label')}
          onchange={(checked) => protection.setEnabled(checked)}
        />
      </div>

      <nav class="tab-nav" aria-label={t('popup.tabs.aria')}>
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            class:active={$activeTab === tab.id}
            aria-current={$activeTab === tab.id ? "page" : undefined}
            onclick={() => setActiveTab(tab.id)}
          >
            {t(tab.label)}
          </button>
        {/each}
      </nav>
    </header>

    <ModelDownloadStatus />

    <section class="shell-body" aria-live="polite">
      {#if $activeTab === "protect"}
        <ProtectTab
          {protection}
          {categories}
          {vault}
          openPrivacyPolicy={settings.openPrivacyPolicy}
          openTermsOfUse={settings.openTermsOfUse}
          openImpressum={settings.openImpressum}
        />
      {:else if $activeTab === "detect"}
        <DetectTab {categories} />
      {:else if $activeTab === "test"}
        <TestTab
          testInput={test.testInput}
          isRunning={test.isRunning}
          resultText={test.resultText}
          enabledCount={categories.enabledCount}
          feedbackCounts={test.feedbackCounts}
          runDetection={test.runDetection}
          clearFeedback={test.clearFeedback}
        />
      {:else if $activeTab === "settings"}
        <SettingsTab
          minConfidence={settings.minConfidence}
          debug={settings.debug}
          clipboardInterceptEnabled={settings.clipboardInterceptEnabled}
          nerModel={settings.nerModel}
          nerModelChoice={settings.nerModelChoice}
          nerModelChoices={settings.nerModelChoices}
          sensitivityMode={categories.sensitivityMode}
          feedbackCounts={test.feedbackCounts}
          mappingCount={vault.mappingCount}
          setMinConfidence={settings.setMinConfidence}
          setDebug={settings.setDebug}
          setClipboardInterceptEnabled={settings.setClipboardInterceptEnabled}
          setNerModelChoice={settings.setNerModelChoice}
          openOptions={settings.openOptions}
          openIssueReport={settings.openIssueReport}
          openSecurityReport={settings.openSecurityReport}
          openPrivacySupport={settings.openPrivacySupport}
          openPrivacyPolicy={settings.openPrivacyPolicy}
          openTermsOfUse={settings.openTermsOfUse}
          openImpressum={settings.openImpressum}
          clearFeedback={test.clearFeedback}
          clearMappings={vault.clearMappings}
        />
      {/if}
    </section>

    <footer class="shell-footer">
      <button type="button" onclick={openSidePanel} title={t('popup.footer.sidePanel.title')}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.8" y="3.5" width="14.4" height="13" rx="2" /><path d="M12.2 3.5v13" /></svg>
        {t('popup.footer.sidePanel')}
      </button>
      <button type="button" onclick={() => settings.openOptions()}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 6h8M15 6h1.5M3.5 14h1.5M8.5 14h8" /><circle cx="13" cy="6" r="1.8" /><circle cx="6.8" cy="14" r="1.8" /></svg>
        {t('popup.footer.options')}
      </button>
    </footer>
  </main>
</div>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    margin: 0;
    width: var(--popup-width);
    min-height: var(--popup-height);
  }
  :global(body) {
    font-family: var(--font-sans);
    background: var(--color-surface);
    color: var(--color-ink);
    -webkit-font-smoothing: antialiased;
  }

  .page-frame {
    min-height: var(--popup-height);
    display: grid;
    place-items: center;
    box-sizing: border-box;
  }
  .popup-shell {
    width: var(--popup-width);
    height: var(--popup-height);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-surface);
    color: var(--color-ink);
  }
  .shell-header {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 14px 10px;
    background: var(--color-card);
    border-bottom: 1px solid var(--color-border);
  }
  .brand-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo-box {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    filter: drop-shadow(0 4px 10px rgb(79 70 229 / 25%));
  }
  .brand-copy {
    flex: 1;
    min-width: 0;
  }
  .brand-copy h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.3px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .beta-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.6px;
    line-height: 1.5;
    text-transform: uppercase;
  }
  .brand-copy p {
    margin: 1px 0 0;
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 10.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .master {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-input);
    transition: background 160ms ease, border-color 160ms ease;
  }
  .master.on {
    border-color: var(--tone-ok-border);
    background: var(--tone-ok-bg);
  }
  .master-dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--color-toggle-off);
  }
  .master.on .master-dot {
    background: var(--color-success);
    box-shadow: 0 0 0 4px rgb(34 197 94 / 18%);
  }
  .master-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .master-copy strong {
    font-size: 12.5px;
    font-weight: 600;
  }
  .master-copy span {
    color: var(--color-muted);
    font-size: 11px;
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
  .shell-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 12px 16px;
    background: var(--color-surface);
  }
  .shell-footer {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--color-border);
    background: var(--color-card);
  }
  .shell-footer button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .shell-footer button:hover {
    border-color: var(--color-border-strong);
    background: var(--color-hover);
  }
  .shell-footer svg {
    width: 15px;
    height: 15px;
    color: var(--color-accent);
  }
</style>
