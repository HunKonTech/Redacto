<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    INITIAL_MODEL_DOWNLOAD_STATE,
    isModelDownloadActive,
    loadModelDownloadState,
    MODEL_DOWNLOAD_STATE_KEY,
    modelDownloadMessage,
    modelDownloadPercent,
    modelDownloadsEnabled,
    type ModelDownloadState,
  } from "../../shared/local-ai-model-download";

  // Only builds that download the Local AI model (Firefox) show this.
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

  function retry(): void {
    void chrome.runtime.sendMessage({ type: "DOWNLOAD_LOCAL_AI_MODEL" });
  }
</script>

{#if visible}
  <div class="model-download" class:failed={state.phase === "failed"} role="status">
    <p>{modelDownloadMessage(state)}</p>
    {#if active}
      <div
        class="bar"
        role="progressbar"
        aria-label="Local AI model download"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={state.phase === "downloading" ? percent : undefined}
      >
        <span class:indeterminate={state.phase !== "downloading"} style:width={state.phase === "downloading" ? `${percent}%` : undefined}></span>
      </div>
      {#if !state.readyVersion}
        <p class="hint">Until it finishes, pattern-based detection protects your pastes.</p>
      {/if}
    {:else}
      <button type="button" onclick={retry}>Try again</button>
    {/if}
  </div>
{/if}

<style>
  .model-download {
    padding: 8px 18px 10px;
    background: var(--color-accent-soft);
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
