<script lang="ts">
  import { t } from "../../shared/i18n/reactive";
  import {
    isModelDownloadActive,
    modelDownloadPercent,
    modelDownloadsEnabled,
  } from "../../shared/local-ai-model-download";
  import { modelDownloadState, requestModelDownload } from "../../shared/model-download-store";
  import { modelDownloadText } from "./model-download-text";

  // Shown in the popup and the side panel (browsers and IDE plugins) while the
  // Local AI model downloads or after a failed download; the web page, which
  // serves the model itself, never shows it.
  const enabled = modelDownloadsEnabled();
  const state = $derived($modelDownloadState);

  const active = $derived(isModelDownloadActive(state));
  const visible = $derived(enabled && (active || state.phase === "failed"));
  const percent = $derived(modelDownloadPercent(state));
  const message = $derived(modelDownloadText(state));

  function retry(): void {
    requestModelDownload();
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
