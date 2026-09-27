/**
 * Privacy Guardrail — Anonymization history (shared)
 *
 * What was anonymized, when, and the `token -> original` pairs it used, so the
 * side panel can list past anonymizations and turn an AI reply to any one of
 * them back into the original values — including text copied from a site the
 * extension does not run on, where no conversation record exists.
 *
 * Entries carry original values. With cross-session memory on they are kept in
 * `chrome.storage.local`, next to the identity vault that already holds the
 * same values; with it off they go to `chrome.storage.session`, so the setting
 * keeps meaning that nothing outlives the browser session.
 *
 * The storage functions degrade like the conversation records do: an area
 * that is missing or rejects reads as empty, never as an error.
 */

import { normalizeForMatch, textFingerprint } from './already-anonymized';
import { bareIdentifierPlaceholder } from './code-identifiers';
import type { EntityMap } from './entity-map';
import { augmentEntityMap } from './entity-map-augment';
import type { IdentityVaultData } from './identity-vault';
import { resolveText, type ResolveResult } from './placeholder-resolver';
import type { StoredEntityMap } from './storage';

export const HISTORY_STORAGE_KEY = 'pg_anonymization_history';
/** Entries kept per storage area; the oldest go first. */
export const MAX_HISTORY_ENTRIES = 50;
/**
 * Longest text kept per entry. Restoring needs only the pairs, so a long
 * paste is clipped for display rather than let a few entries fill the quota.
 */
export const MAX_HISTORY_TEXT_CHARS = 20_000;

/** Where an anonymization happened. */
export type HistorySource = 'paste' | 'side-panel' | 'ide';

export interface HistoryEntry {
  id: string;
  createdAt: number;
  source: HistorySource;
  /**
   * Hostname the paste went to, or the IDE and view ("VS Code · editor") a
   * selection came from; absent for the side panel.
   */
  site?: string;
  originalText: string;
  anonymizedText: string;
  /**
   * `textFingerprint` of the full anonymized text, so a paste of it is
   * recognised even when `anonymizedText` was clipped.
   */
  anonymizedFingerprint?: string;
  /** True when either text was clipped to `MAX_HISTORY_TEXT_CHARS`. */
  truncated: boolean;
  /** Replacement token (placeholder, synthetic value or alias) → original. */
  mappings: StoredEntityMap;
  /** Detected items replaced. */
  replacedCount: number;
  /** Distinct code identifiers renamed. */
  renamedIdentifiers: number;
}

export interface NewHistoryEntry {
  /** Reuse an id to replace an entry, e.g. when the side panel re-copies. */
  id?: string;
  source: HistorySource;
  site?: string;
  originalText: string;
  anonymizedText: string;
  mappings: StoredEntityMap;
  replacedCount: number;
  renamedIdentifiers: number;
}

function makeId(now: number): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `hist-${now.toString(36)}-${rand}`;
}

function clip(text: string): { text: string; clipped: boolean } {
  return text.length > MAX_HISTORY_TEXT_CHARS
    ? { text: text.slice(0, MAX_HISTORY_TEXT_CHARS), clipped: true }
    : { text, clipped: false };
}

/** Build an entry ready to save. */
export function createHistoryEntry(input: NewHistoryEntry, now: number = Date.now()): HistoryEntry {
  const original = clip(input.originalText);
  const anonymized = clip(input.anonymizedText);
  return {
    id: input.id ?? makeId(now),
    createdAt: now,
    source: input.source,
    ...(input.site ? { site: input.site } : {}),
    originalText: original.text,
    anonymizedText: anonymized.text,
    anonymizedFingerprint: textFingerprint(input.anonymizedText),
    truncated: original.clipped || anonymized.clipped,
    mappings: { ...input.mappings },
    replacedCount: input.replacedCount,
    renamedIdentifiers: input.renamedIdentifiers,
  };
}

/**
 * The pairs of `map` that `anonymizedText` actually uses.
 *
 * The map handed back by the anonymizer is conversation-wide, so it can hold
 * pairs from earlier pastes; an entry keeps only its own. Inside code a
 * placeholder is written without brackets (`getPERSON_1Invoice`), so the bare
 * form counts as a use too.
 */
export function usedMappings(anonymizedText: string, map: EntityMap): StoredEntityMap {
  const used: StoredEntityMap = {};
  for (const [token, original] of map.entries()) {
    if (!token) continue;
    if (anonymizedText.includes(token) || anonymizedText.includes(bareIdentifierPlaceholder(token))) {
      used[token] = original;
    }
  }
  return used;
}

/**
 * Turn `text` — typically an AI reply — back into original values using one
 * entry's pairs.
 *
 * The pairs are the evidence that this anonymization used a token, so they
 * earn the resolver's tolerant matching (`person 1`, `[person_1]`). The vault
 * adds the other form of each record the entry used: a model may echo the
 * synthetic value where the placeholder was sent, or the reverse.
 */
export function restoreFromHistory(
  text: string,
  entry: HistoryEntry,
  vault: IdentityVaultData,
  vaultEnabled: boolean,
): ResolveResult {
  return resolveText(text, augmentEntityMap(entry.mappings, vault, vaultEnabled));
}

/**
 * The entry whose anonymized text `text` is, whole — a copy of it pasted
 * somewhere. Null for anything else, including a part of one.
 */
export function findEntryForAnonymizedText(
  text: string,
  entries: readonly HistoryEntry[],
): HistoryEntry | null {
  const fingerprint = textFingerprint(text);
  const normalized = normalizeForMatch(text);
  return (
    entries.find((entry) =>
      entry.anonymizedFingerprint
        ? entry.anonymizedFingerprint === fingerprint
        : !entry.truncated && normalizeForMatch(entry.anonymizedText) === normalized,
    ) ?? null
  );
}

/**
 * The entry `text` most likely came from: the one whose pairs account for
 * the most distinct tokens in it, the newest on a tie. Null when no entry
 * resolves anything. `entries` is newest first, as
 * `loadAnonymizationHistory` returns it.
 *
 * With cross-session memory off every anonymization numbers its placeholders
 * from 1, so `[PERSON_1]` alone cannot tell two entries apart — the other
 * tokens in the reply usually can, and the newest entry is the likelier one
 * when they cannot.
 */
export function bestHistoryMatch(
  text: string,
  entries: readonly HistoryEntry[],
  vault: IdentityVaultData,
  vaultEnabled: boolean,
): HistoryEntry | null {
  let best: HistoryEntry | null = null;
  let bestCount = 0;
  for (const entry of entries) {
    const { matches } = restoreFromHistory(text, entry, vault, vaultEnabled);
    const count = new Set(matches.map((match) => match.matchText)).size;
    if (count > bestCount) {
      best = entry;
      bestCount = count;
    }
  }
  return best;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<HistoryEntry>;
  return (
    typeof e.id === 'string' &&
    typeof e.createdAt === 'number' &&
    (e.source === 'paste' || e.source === 'side-panel' || e.source === 'ide') &&
    typeof e.originalText === 'string' &&
    typeof e.anonymizedText === 'string' &&
    !!e.mappings &&
    typeof e.mappings === 'object' &&
    Object.values(e.mappings).every((original) => typeof original === 'string') &&
    typeof e.replacedCount === 'number' &&
    typeof e.renamedIdentifiers === 'number'
  );
}

type Area = chrome.storage.StorageArea;

function localArea(): Area | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.storage?.local ?? null;
}

function sessionArea(): Area | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.storage?.session ?? null;
}

async function readEntries(area: Area | null): Promise<HistoryEntry[]> {
  if (!area) return [];
  try {
    const result = await area.get(HISTORY_STORAGE_KEY);
    const stored = result?.[HISTORY_STORAGE_KEY];
    return Array.isArray(stored) ? stored.filter(isHistoryEntry) : [];
  } catch {
    return [];
  }
}

async function writeEntries(area: Area, entries: HistoryEntry[]): Promise<void> {
  if (entries.length === 0) {
    await area.remove(HISTORY_STORAGE_KEY);
  } else {
    await area.set({ [HISTORY_STORAGE_KEY]: entries });
  }
}

/** Remove one entry from an area, if it is there. */
async function dropFrom(area: Area | null, id: string): Promise<void> {
  if (!area) return;
  const entries = await readEntries(area);
  const kept = entries.filter((entry) => entry.id !== id);
  if (kept.length === entries.length) return;
  try {
    await writeEntries(area, kept);
  } catch {
    // Best effort; an area that cannot be written holds nothing new.
  }
}

/** Every entry from both areas, newest first. */
export async function loadAnonymizationHistory(): Promise<HistoryEntry[]> {
  const [durable, session] = await Promise.all([
    readEntries(localArea()),
    readEntries(sessionArea()),
  ]);
  const byId = new Map<string, HistoryEntry>();
  for (const entry of [...session, ...durable]) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Save an entry, replacing any entry with the same id.
 *
 * `persistent` follows the cross-session memory setting. The setting can be
 * flipped between two saves of the same entry, so the other area is swept.
 */
export async function saveHistoryEntry(entry: HistoryEntry, persistent: boolean): Promise<void> {
  const area = persistent ? localArea() : sessionArea();
  if (!area) return;

  const entries = (await readEntries(area)).filter((existing) => existing.id !== entry.id);
  entries.push(entry);
  entries.sort((a, b) => b.createdAt - a.createdAt);
  await writeEntries(area, entries.slice(0, MAX_HISTORY_ENTRIES));

  await dropFrom(persistent ? sessionArea() : localArea(), entry.id);
}

/** Delete one entry, wherever it is kept. */
export async function deleteHistoryEntry(id: string): Promise<void> {
  await Promise.all([dropFrom(localArea(), id), dropFrom(sessionArea(), id)]);
}

/** Delete every entry from both areas. */
export async function clearAnonymizationHistory(): Promise<void> {
  for (const area of [localArea(), sessionArea()]) {
    if (!area) continue;
    try {
      await area.remove(HISTORY_STORAGE_KEY);
    } catch {
      // Best effort per area, like `clearEntityMaps`.
    }
  }
}
