<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "../../shared/i18n/reactive";
  import {
    INITIAL_MODEL_DOWNLOAD_STATE,
    isModelDownloadActive,
    loadModelDownloadState,
    MODEL_DOWNLOAD_STATE_KEY,
    modelDownloadPercent,
    modelDownloadsEnabled,
    type ModelDownloadState,
  } from "../../shared/local-ai-model-download";

  // Shown in the popup and the side panel (browsers and IDE plugins) while the
  // Local AI model downloads or after a failed download; the web page, which
  // serves the model itself, never shows it.
  let state: ModelDownloadState = $state(INITIAL_MODEL_DOWNLOAD_STATE);
  const enabled = modelDownloadsEnabled();

  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "local" && changes[MODEL_DOWNLOAD_STATE_KEY]) {
      state = { ...INITIAL_MODEL_DOWNLOAD_STATE, ...changes[MODEL_DOWNLOAD_STATE_KEY].newValue };
    }
  };
  if (enabled) {
    void loadModelDownloadState().then((loaded) => { state = loaded; });
    chrome.storage.onChanged.addListener(onChanged);
  }
  onDestroy(() => {
    if (enabled) chrome.storage.onChanged.removeListener(onChanged);
  });

  const active = $derived(isModelDownloadActive(state));
  const visible = $derived(enabled && (active || state.phase === "failed"));
  const percent = $derived(modelDownloadPercent(state));
  const megabytes = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`;
  const message = $derived.by((): string => {
    const updating = Boolean(state.readyVersion);
    switch (state.phase) {
      case "checking":
        return updating ? t("model.checking.update") : t("model.checking");
      case "downloading":
        return t(updating ? "model.downloading.update" : "model.downloading", {
          percent,
          received: megabytes(state.receivedBytes),
          total: megabytes(state.totalBytes),
        });
      case "verifying":
        return t("model.verifying");
      case "failed":
        return t(updating ? "model.failed.update" : "model.failed", { error: state.error ?? t("model.unknownError") });
      default:
        return state.readyVersion ? t("model.ready") : t("model.notDownloaded");
    }
  });

  function retry(): void {
    void chrome.runtime.sendMessage({ type: "DOWNLOAD_LOCAL_AI_MODEL" });
  }
</script>

{#if visible}
  <div class="model-download" class:failed={state.phase === "failed"} role="status">
    <p>{message}</p>
    {#if active}
      <div
        class="bar"
        role="progressbar"
        aria-label={t("model.progressAria")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={state.phase === "downloading" ? percent : undefined}
      >
        <span class:indeterminate={state.phase !== "downloading"} style:width={state.phase === "downloading" ? `${percent}%` : undefined}></span>
      </div>
      {#if !state.readyVersion}
        <p class="hint">{t("model.patternHint")}</p>
      {/if}
    {:else}
      <button type="button" onclick={retry}>{t("common.tryAgain")}</button>
    {/if}
  </div>
{/if}

<style>
  .model-download {
    padding: 9px 16px 10px;
    background: var(--tone-info-bg);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-ink);
    font-size: 11px;
  }
  .model-download.failed {
    color: var(--color-danger);
  }
  p {
    margin: 0 0 6px;
    line-height: 1.35;
  }
  .hint {
    margin: 6px 0 0;
    color: var(--color-muted);
  }
  .bar {
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--color-border);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--color-accent);
    transition: width 0.3s ease;
  }
  .bar span.indeterminate {
    width: 30%;
    animation: slide 1.2s ease-in-out infinite;
  }
  @keyframes slide {
    from { transform: translateX(-100%); }
    to { transform: translateX(340%); }
  }
  button {
    font: inherit;
    padding: 3px 10px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-card);
    color: var(--color-ink);
    cursor: pointer;
  }
</style>
