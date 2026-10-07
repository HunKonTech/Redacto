<script lang="ts">
  import type { DevDiagnostics, PiiSpan } from '../../../shared/message-types';
  import { deviceText, heapText, rawItemCount, rawOutputJson, sourceSummary, spansJson } from '../../dev/format-dev-diagnostics';
  import { downloadDebugLog } from '../../dev/debug-log';

  let {
    diagnostics,
    spans,
    originalText,
    previewText,
  }: {
    diagnostics: DevDiagnostics;
    spans: readonly PiiSpan[];
    originalText: string;
    /** The paste as the current review would send it. */
    previewText: string;
  } = $props();

  let rawEl: HTMLPreElement | undefined = $state();
  let copied = $state<'raw' | 'spans' | null>(null);
  let open = $state(false);
  let confirmingLog = $state(false);

  function askForLog(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    open = true;
    confirmingLog = true;
  }

  function downloadLog(): void {
    confirmingLog = false;
    downloadDebugLog({ surface: 'overlay', originalText, anonymizedText: previewText, spans, diagnostics });
  }

  const rawJson = $derived(rawOutputJson(diagnostics));
  const summary = $derived(
    [
      diagnostics.nerEnabled ? (diagnostics.model?.label ?? diagnostics.model?.key ?? 'model') : 'LLM off',
      deviceText(diagnostics.model),
      diagnostics.timings ? `${diagnostics.timings.inferenceMs ?? diagnostics.timings.totalMs} ms` : null,
      heapText(diagnostics.memory) ? `heap ${heapText(diagnostics.memory)}` : null,
      diagnostics.regexEnabled ? null : 'regex off',
      `spans ${sourceSummary(diagnostics.spanCountsBySource)}`,
    ].filter(Boolean).join(' · '),
  );

  async function copy(part: 'raw' | 'spans', event: MouseEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(part === 'raw' ? rawJson : spansJson(spans));
      copied = part;
      setTimeout(() => (copied = null), 1800);
    } catch {
      // The page may refuse clipboard access; select the JSON for a manual copy instead.
      if (!rawEl) return;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(rawEl);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }
</script>

<details class="pg-dev" bind:open>
  <summary>
    <span class="pg-dev-tag">DEV</span>
    <span class="pg-dev-summary">{summary}</span>
    <span class="pg-dev-actions">
      {#if diagnostics.rawNerOutput}
        <button type="button" class="pg-btn-link" onclick={(event) => copy('raw', event)}>{copied === 'raw' ? 'Copied' : 'Copy raw output'}</button>
      {/if}
      <button type="button" class="pg-btn-link" onclick={(event) => copy('spans', event)}>{copied === 'spans' ? 'Copied' : 'Copy spans'}</button>
      <button type="button" class="pg-btn-link" onclick={askForLog}>Download log</button>
    </span>
  </summary>
  {#if confirmingLog}
    <div class="pg-dev-log-warning" role="alertdialog" aria-label="Sensitive data warning">
      <p class="pg-dev-log-title"><span title="Okay, one exception: if we agreed on it in person, face to face, out loud. You bring the coffee.">⚠</span> This file contains sensitive data</p>
      <p>The log holds the original, unredacted text, the anonymized text, every detected item, the raw model output and the timings. It is saved only to this device.</p>
      <p><strong>Do not share it with anyone. The Redacto developer will never ask you for it — not by e-mail, issue, chat or phone.</strong></p>
      <div class="pg-dev-log-actions">
        <button type="button" class="pg-btn-link pg-dev-error" onclick={downloadLog}>I understand, download</button>
        <button type="button" class="pg-btn-link" onclick={() => (confirmingLog = false)}>Cancel</button>
      </div>
    </div>
  {/if}
  {#if diagnostics.error}
    <p class="pg-dev-note pg-dev-error">Model error: {diagnostics.error}</p>
  {/if}
  {#if diagnostics.rawNerOutput}
    <p class="pg-dev-note">
      Raw model output · {diagnostics.rawNerOutput.length} chunks · {rawItemCount(diagnostics)} items{#if diagnostics.nerInputView === 'identifier-split'} · offsets refer to the identifier-split text{/if}
    </p>
    <pre class="pg-dev-raw" bind:this={rawEl}>{rawJson}</pre>
  {:else}
    <p class="pg-dev-note">The Local AI model did not run for this text.</p>
  {/if}
</details>
