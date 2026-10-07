/**
 * Plain-text pieces of the developer-mode panel, shared by the side panel,
 * the options page and the in-page review overlay.
 */

import type { DevDiagnostics, PiiSpan } from '../../shared/message-types';
import { formatMegabytes } from '../../shared/local-ai-model-download';

const SOURCE_ORDER: PiiSpan['source'][] = ['ner', 'regex', 'manual'];

/** "3 ner · 2 regex", or "0" when the pipeline found nothing. */
export function sourceSummary(counts: DevDiagnostics['spanCountsBySource']): string {
  const parts = SOURCE_ORDER
    .filter((source) => (counts[source] ?? 0) > 0)
    .map((source) => `${counts[source]} ${source}`);
  return parts.length > 0 ? parts.join(' · ') : '0';
}

export function rawItemCount(diagnostics: DevDiagnostics): number {
  return (diagnostics.rawNerOutput ?? []).reduce((sum, chunk) => sum + chunk.items.length, 0);
}

/** "86 / 4096 MB", or null when the browser does not report its heap. */
export function heapText(memory: DevDiagnostics['memory']): string | null {
  if (!memory) return null;
  return `${Math.round(memory.usedBytes / (1024 * 1024))} / ${formatMegabytes(memory.limitBytes)}`;
}

/** "webgpu · q4f16"; parts the runtime did not report are left out. */
export function deviceText(model: DevDiagnostics['model']): string | null {
  const parts = [model?.device, model?.dtype].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function timingText(timings: DevDiagnostics['timings']): string | null {
  if (!timings) return null;
  const load = typeof timings.loadMs === 'number' ? `${timings.loadMs}` : '–';
  const inference = typeof timings.inferenceMs === 'number' ? `${timings.inferenceMs}` : `${timings.totalMs}`;
  return `${load} · ${inference} ms`;
}

export function chunkText(diagnostics: DevDiagnostics): string | null {
  const chunks = diagnostics.timings?.chunkCount ?? diagnostics.rawNerOutput?.length;
  if (chunks === undefined && diagnostics.model?.threads === undefined) return null;
  return `${chunks ?? '–'} · ${diagnostics.model?.threads ?? '–'}`;
}

/** The model's answer as indented JSON, ready to paste into an issue. */
export function rawOutputJson(diagnostics: DevDiagnostics): string {
  return JSON.stringify(
    {
      model: diagnostics.model?.key,
      device: diagnostics.model?.device,
      dtype: diagnostics.model?.dtype,
      ...(diagnostics.nerInputView ? { inputView: diagnostics.nerInputView } : {}),
      chunks: diagnostics.rawNerOutput ?? [],
    },
    null,
    2,
  );
}

/** The spans the review starts from, without the offsets' byte/char ambiguity. */
export function spansJson(spans: readonly PiiSpan[]): string {
  return JSON.stringify(
    spans.map((span) => ({
      text: span.text,
      type: span.entity_type,
      source: span.source,
      score: Number(span.score.toFixed(3)),
      ...(span.nerRawLabel ? { rawLabel: span.nerRawLabel } : {}),
      start: span.start,
      end: span.end,
    })),
    null,
    2,
  );
}
