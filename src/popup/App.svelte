<script lang="ts">
  import { debugError } from '../shared/debug-log';
  import { canOpenSidePanel, openSidePanel as openBrowserSidePanel } from '../shared/side-panel';
  import { createAppModels, tabs } from "./popup-model.svelte";
  import DetectTab from "./components/DetectTab.svelte";
  import ModelDownloadStatus from "./components/ModelDownloadStatus.svelte";
  import PGLogo from "./components/PGLogo.svelte";
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
  <main class="popup-shell" aria-label="Redacto popup">
    <header class="shell-header">
      <div class="brand-row">
        <div class="logo-box"><PGLogo size={24} /></div>
        <div class="brand-copy">
          <h1>Redacto <span class="beta-badge" title="Public beta — features may change">BETA</span></h1>
          <p>v{$version} · {$modelLabel}</p>
        </div>
        <Toggle
          checked={$protectionEnabled}
          label="Master protection"
          onchange={(checked) => protection.setEnabled(checked)}
        />
      </div>

      <nav class="tab-nav" aria-label="Popup sections">
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            class:active={$activeTab === tab.id}
            aria-current={$activeTab === tab.id ? "page" : undefined}
            onclick={() => setActiveTab(tab.id)}
          >
            {tab.label}
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
      <button type="button" onclick={openSidePanel} title="History, restore and anonymize (Alt+Shift+P)">Open side panel</button>
      <button type="button" onclick={() => settings.openOptions()}>More settings…</button>
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
    background: #e5e7eb;
    color: var(--color-ink);
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
    background: var(--color-header);
    color: white;
    border-bottom: 1px solid rgb(255 255 255 / 6%);
  }
  .brand-row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 18px;
  }
  .logo-box {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    flex-shrink: 0;
  }
  .brand-copy {
    flex: 1;
    min-width: 0;
  }
  .brand-copy h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 300;
    letter-spacing: -0.1px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .beta-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-glow, #f59e0b);
    color: #ffffff;
    text-shadow: 0 0 1px #000;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.6px;
    line-height: 1.4;
    text-transform: uppercase;
    vertical-align: middle;
  }
  .brand-copy p {
    margin: 1px 0 0;
    color: var(--color-muted);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab-nav {
    display: flex;
    position: relative;
    border-top: 1px solid rgb(255 255 255 / 6%);
  }
  .tab-nav button {
    position: relative;
    flex: 1;
    padding: 11px 8px 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    background: transparent;
    color: rgb(255 255 255 / 50%);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1px;
    cursor: pointer;
  }
  .tab-nav button.active {
    border-bottom-color: var(--color-glow);
    box-shadow: inset 0 -14px 28px -11px var(--color-glow);
    color: white;
    font-weight: 600;
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
    border-top: 1px solid rgb(14 23 38 / 8%);
    background: var(--color-header);
  }
  .shell-footer button {
    width: 100%;
    padding: 6px;
    border: 0;
    background: transparent;
    color: #93c5fd;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
</style>
