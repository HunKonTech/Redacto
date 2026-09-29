/**
 * Redacto — Side panel anonymizer
 *
 * The paste flow of the chat pages, for text pasted into the side panel:
 * detect, let the user switch items off, anonymize, and — once the result is
 * copied — record it in the identity vault and the history so a reply to it
 * can be restored later.
 *
 * Previews never touch storage. They run against a copy of the vault, so
 * switching an item on and off does not leave records behind for text that
 * was never used; `commitPanelAnonymization` repeats the run against the
 * vault as it is at that moment and saves it.
 */

import { anonymize, anonymizeWithVault } from '../shared/anonymizer';
import { dropKnownReplacements, knownReplacementTokens } from '../shared/already-anonymized';
import {
  createHistoryEntry,
  findEntryForAnonymizedText,
  loadAnonymizationHistory,
  saveHistoryEntry,
  usedMappings,
  type HistoryEntry,
} from '../shared/anonymization-history';
import { extractCodeRegionTexts } from '../shared/code-rename';
import { detectionOptionsFromSettings } from '../shared/detection-config';
import { EntityMap } from '../shared/entity-map';
import { computeAdaptiveThresholds } from '../shared/feedback';
import type { IdentifierVerdict } from '../shared/identifier-classifier-constants';
import {
  loadIdentityVault,
  saveIdentityVault,
  type IdentityVaultData,
} from '../shared/identity-vault';
import type {
  ClassifyIdentifiersResponse,
  DetectPiiRequest,
  PiiResultResponse,
  PiiSpan,
  Settings,
} from '../shared/message-types';
import type { StoredEntityMap } from '../shared/storage';
import { loadSettings } from '../shared/storage';
import { prepareReviewSpans } from '../content/review-spans';

export type IdentifierClassifications = ReadonlyMap<string, IdentifierVerdict>;

/**
 * Whether identifier renaming, if it ran at all, used the identifier-classifier
 * ONNX model or fell back to the hardcoded `LIBRARY_NAMES` list — shown in the
 * side panel so "why was this name (not) renamed" has a visible answer instead
 * of being an implementation detail only debugLog surfaces.
 */
export type ClassifierStatus =
  /** "full" code anonymization is off; identifiers are not renamed at all. */
  | 'off'
  /** Renaming is on, but the text has no code-like regions to classify. */
  | 'no-code'
  /** The classifier model answered for this paste's undeclared names. */
  | 'model'
  /** The model was unavailable or errored; the static list was used instead. */
  | 'fallback';

/** What a detection run hands the panel. */
export interface PanelDetection {
  spans: PiiSpan[];
  classifications?: IdentifierClassifications;
  classifierStatus: ClassifierStatus;
  /** Replacement tokens the anonymizer must leave alone. */
  knownReplacements: string[];
  /** Set when the text is, whole, the anonymized text of this entry. */
  alreadyAnonymized?: HistoryEntry;
}

/** Where text handed to the panel from outside came from, e.g. an IDE selection. */
export interface PanelOrigin {
  /** Shown in History, e.g. "VS Code · editor". */
  label: string;
}

export interface PanelAnonymization {
  text: string;
  mappings: StoredEntityMap;
  renamedIdentifiers: number;
}

let requestCounter = 0;

/**
 * Run the detection pipeline on `text` and apply the same filtering a paste
 * on a chat page gets: enabled categories, allowlist, blocklist and the
 * sensitivity thresholds.
 */
export async function detectForPanel(text: string, settings: Settings): Promise<PanelDetection> {
  const history = await loadAnonymizationHistory();
  const knownReplacements = history.flatMap((entry) => Object.keys(entry.mappings));
  const alreadyAnonymized = findEntryForAnonymizedText(text, history);
  if (alreadyAnonymized) {
    return { spans: [], classifierStatus: 'off', knownReplacements, alreadyAnonymized };
  }

  const requestId = `sidepanel_${Date.now()}_${requestCounter++}`;
  const request: DetectPiiRequest = {
    type: 'DETECT_PII',
    payload: { text, requestId, config: detectionOptionsFromSettings(settings) },
  };
  const response = (await chrome.runtime.sendMessage(request)) as
    | (PiiResultResponse & { error?: string })
    | undefined;
  if (response?.type !== 'PII_RESULT') {
    throw new Error('Invalid response from the detection pipeline');
  }
  if (response.error) throw new Error(response.error);

  const adaptiveThresholds = await computeAdaptiveThresholds(settings.minConfidence);
  const vault = settings.identityVaultEnabled ? await loadIdentityVault() : null;
  const known = knownReplacementTokens({ vault, extra: knownReplacements });
  const spans = dropKnownReplacements(
    prepareReviewSpans(text, response.payload.spans, settings, adaptiveThresholds),
    known,
  );
  let classifications: IdentifierClassifications | undefined;
  let classifierStatus: ClassifierStatus = 'off';
  if (settings.codeAnonymization === 'full') {
    ({ classifications, status: classifierStatus } = await classifyCodeIdentifiers(text));
  }
  return { spans, classifications, classifierStatus, knownReplacements };
}

/**
 * Same round trip the content script makes on paste. Best-effort: a
 * 'fallback' status leaves renaming to the library-name list.
 */
async function classifyCodeIdentifiers(
  text: string,
): Promise<{ classifications?: IdentifierClassifications; status: ClassifierStatus }> {
  const texts = extractCodeRegionTexts(text);
  if (texts.length === 0) return { status: 'no-code' };
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'CLASSIFY_IDENTIFIERS',
      payload: { requestId: `sidepanel_identifiers_${Date.now()}_${requestCounter++}`, texts },
    })) as ClassifyIdentifiersResponse | undefined;
    if (response?.type !== 'IDENTIFIER_CLASSIFICATION_RESULT' || !response.payload.available) {
      return { status: 'fallback' };
    }
    return {
      classifications: new Map(response.payload.classifications.map((c) => [c.name, c.label])),
      status: 'model',
    };
  } catch {
    return { status: 'fallback' };
  }
}

/**
 * Anonymize `originalText` with `approvedSpans`. `vault` is mutated; pass a
 * copy for a preview. A null vault is the cross-session-memory-off path:
 * placeholders are numbered for this text alone.
 */
export function anonymizeForPanel(
  originalText: string,
  approvedSpans: PiiSpan[],
  settings: Settings,
  vault: IdentityVaultData | null,
  classifications?: IdentifierClassifications,
  knownReplacements: Iterable<string> = [],
): PanelAnonymization {
  const options = {
    renameIdentifiers: settings.codeAnonymization === 'full',
    identifierClassifications: classifications,
    knownReplacements,
  };
  const result = vault
    ? anonymizeWithVault(originalText, approvedSpans, vault, settings.defaultReplacementMode, new EntityMap(), options)
    : anonymize(originalText, approvedSpans, new EntityMap(), options);
  return {
    text: result.text,
    mappings: usedMappings(result.text, result.entityMap),
    renamedIdentifiers: result.renamedIdentifiers,
  };
}

/** A preview that leaves `vault` untouched. */
export function previewForPanel(
  originalText: string,
  approvedSpans: PiiSpan[],
  settings: Settings,
  vault: IdentityVaultData | null,
  classifications?: IdentifierClassifications,
  knownReplacements: Iterable<string> = [],
): PanelAnonymization {
  const scratch = vault && settings.identityVaultEnabled ? structuredClone(vault) : null;
  return anonymizeForPanel(originalText, approvedSpans, settings, scratch, classifications, knownReplacements);
}

/**
 * Anonymize against the stored vault, save the vault and write the history
 * entry. `entryId` replaces an entry saved by an earlier copy of the same
 * text, so re-copying after switching an item off does not add a second one.
 * Text with nothing replaced has nothing to restore and is not recorded.
 */
export async function commitPanelAnonymization(
  originalText: string,
  approvedSpans: PiiSpan[],
  classifications: IdentifierClassifications | undefined,
  entryId?: string,
  origin?: PanelOrigin,
): Promise<{ result: PanelAnonymization; entry: HistoryEntry | null }> {
  const settings = await loadSettings();
  const vault = settings.identityVaultEnabled ? await loadIdentityVault() : null;
  // Re-read rather than reused from detection: the entry this call replaces
  // must not count its own tokens as someone else's.
  const knownReplacements = (await loadAnonymizationHistory())
    .filter((entry) => entry.id !== entryId)
    .flatMap((entry) => Object.keys(entry.mappings));
  const result = anonymizeForPanel(originalText, approvedSpans, settings, vault, classifications, knownReplacements);
  if (Object.keys(result.mappings).length === 0) return { result, entry: null };
  if (vault) await saveIdentityVault(vault);

  const entry = createHistoryEntry({
    id: entryId,
    source: origin ? 'ide' : 'side-panel',
    site: origin?.label,
    originalText,
    anonymizedText: result.text,
    mappings: result.mappings,
    replacedCount: approvedSpans.length,
    renamedIdentifiers: result.renamedIdentifiers,
  });
  await saveHistoryEntry(entry, settings.identityVaultEnabled);
  return { result, entry };
}
