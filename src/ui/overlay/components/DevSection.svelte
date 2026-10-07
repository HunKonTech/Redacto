<script lang="ts">
  import type { DevDiagnostics, PiiSpan } from '../../../shared/message-types';
  import { deviceText, heapText, rawItemCount, rawOutputJson, sourceSummary, spansJson } from '../../dev/format-dev-diagnostics';

  let { diagnostics, spans }: { diagnostics: DevDiagnostics; spans: readonly PiiSpan[] } = $props();

  let rawEl: HTMLPreElement | undefined = $state();
  let copied = $state<'raw' | 'spans' | null>(null);

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

<details class="pg-dev">
  <summary>
    <span class="pg-dev-tag">DEV</span>
    <span class="pg-dev-summary">{summary}</span>
    <span class="pg-dev-actions">
      {#if diagnostics.rawNerOutput}
        <button type="button" class="pg-btn-link" onclick={(event) => copy('raw', event)}>{copied === 'raw' ? 'Copied' : 'Copy raw output'}</button>
      {/if}
      <button type="button" class="pg-btn-link" onclick={(event) => copy('spans', event)}>{copied === 'spans' ? 'Copied' : 'Copy spans'}</button>
    </span>
  </summary>
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
