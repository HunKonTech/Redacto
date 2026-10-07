/**
 * Developer mode: one anonymization as a downloadable log file, with
 * everything needed to reproduce a detection bug — the original and the
 * anonymized text, every span, the model's raw answer and the stage timings.
 *
 * The file holds the user's unredacted text, so it is only ever written to
 * their own disk, after a warning, and never sent anywhere.
 */

import type { DevDiagnostics, PiiSpan, Settings } from '../../shared/message-types';

export type DebugLogSurface = 'sidepanel' | 'options' | 'overlay';

export interface DebugLogInput {
  surface: DebugLogSurface;
  originalText: string;
  /** The text as it would be pasted or copied; left out where the surface does not build one. */
  anonymizedText?: string;
  spans: readonly PiiSpan[];
  diagnostics: DevDiagnostics;
  settings?: Settings | null;
}

export const DEBUG_LOG_WARNING =
  'SENSITIVE: this file contains the original, unredacted text. Do not share it with anyone. ' +
  'The Redacto developer will never ask you for it — not by e-mail, issue, chat or phone.';

/** For whoever scrolls all the way down. */
const FOOTNOTE =
  'P.S. Az egyetlen kivétel: ha személyesen, szemtől szemben, szóban egyeztettünk róla. ' +
  'Ott is te hozod a kávét, én a laptopot.';

function extensionVersion(): string | null {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return null;
  }
}

function settingsSnapshot(settings: Settings | null | undefined): Record<string, unknown> | null {
  if (!settings) return null;
  const { allowlist, blocklist, publicDomains, curatedUrls, ...rest } = settings;
  return {
    ...rest,
    allowlist: allowlist.map((entry) => entry.pattern),
    blocklist: blocklist.map((entry) => ({ pattern: entry.pattern, scope: entry.scope })),
    publicDomainCount: publicDomains.length,
    curatedUrlCount: curatedUrls.length,
  };
}

function nerSummary(diagnostics: DevDiagnostics): Record<string, unknown> {
  return {
    enabled: diagnostics.nerEnabled,
    model: diagnostics.model ?? null,
    timings: diagnostics.timings ?? null,
    inputView: diagnostics.nerInputView ?? 'original',
    error: diagnostics.error ?? null,
    rawOutput: diagnostics.rawNerOutput ?? null,
  };
}

export function buildDebugLog(input: DebugLogInput, now: Date = new Date()): string {
  const { diagnostics } = input;
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return JSON.stringify(
    {
      warning: DEBUG_LOG_WARNING,
      createdAt: now.toISOString(),
      surface: input.surface,
      environment: {
        extensionVersion: extensionVersion(),
        userAgent: nav?.userAgent ?? null,
        language: nav?.language ?? null,
        hardwareConcurrency: nav?.hardwareConcurrency ?? null,
        memory: diagnostics.memory ?? null,
      },
      timingsMs: {
        total: diagnostics.stageTimings?.totalMs ?? null,
        localAiModel: diagnostics.stageTimings?.nerMs ?? null,
        modelLoad: diagnostics.timings?.loadMs ?? null,
        modelInference: diagnostics.timings?.inferenceMs ?? null,
        regexPipeline: diagnostics.stageTimings?.pipelineMs ?? null,
        modelWasCold: diagnostics.timings?.wasCold ?? null,
      },
      text: {
        original: input.originalText,
        anonymized: input.anonymizedText ?? null,
        originalLength: input.originalText.length,
      },
      ran: {
        localAiModel: diagnostics.nerEnabled,
        regex: diagnostics.regexEnabled,
      },
      spanCountsBySource: diagnostics.spanCountsBySource,
      spans: input.spans.map((span) => ({
        text: span.text,
        type: span.entity_type,
        source: span.source,
        score: Number(span.score.toFixed(4)),
        start: span.start,
        end: span.end,
        ...(span.nerRawLabel ? { rawLabel: span.nerRawLabel } : {}),
        ...(span.inCodeBlock ? { inCodeBlock: true } : {}),
      })),
      localAiModel: nerSummary(diagnostics),
      settings: settingsSnapshot(input.settings),
      _: FOOTNOTE,
    },
    null,
    2,
  );
}

export function debugLogFileName(now: Date = new Date()): string {
  return `redacto-debug-${now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')}.json`;
}

/** Saves the log through the browser's download prompt. */
export function downloadDebugLog(input: DebugLogInput): void {
  const now = new Date();
  const blob = new Blob([buildDebugLog(input, now)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = debugLogFileName(now);
  link.rel = 'noopener';
  link.style.display = 'none';
  (document.body ?? document.documentElement).appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
