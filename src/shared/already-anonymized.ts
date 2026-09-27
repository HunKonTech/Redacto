/**
 * Privacy Guardrail — Already-anonymized text (shared)
 *
 * Text that was anonymized once must not be anonymized again. Copying the
 * side panel's output into a chat page, or a message from one chat into
 * another, used to run the whole pipeline a second time: synthetic names were
 * detected as people, and code aliases were renamed again (`Class1` →
 * `Class6`). The reply then restored only as far as the first set of
 * replacements, and the vault filled with records whose "original" was a
 * replacement.
 *
 * Two checks prevent that. A paste that is exactly the anonymized text of a
 * history entry is recognised as a whole (`textFingerprint`). Anything else —
 * a part of it, or an edited copy — still has its known replacement tokens
 * left alone (`knownReplacementTokens`, `dropKnownReplacements`).
 *
 * No DOM, no storage, no `chrome.*` access.
 */

import { bareIdentifierPlaceholder } from './code-identifiers';
import type { EntityMap } from './entity-map';
import type { IdentityVaultData } from './identity-vault';
import type { PiiSpan } from './message-types';
import { parsePlaceholder, type ParsedPlaceholder } from './placeholder-variants';
import type { StoredEntityMap } from './storage';

export interface KnownReplacementSources {
  vault?: IdentityVaultData | null;
  entityMap?: EntityMap;
  /** Pair maps from elsewhere, e.g. the anonymization history. */
  mappings?: Iterable<StoredEntityMap>;
  extra?: Iterable<string>;
}

/**
 * Every string the extension has emitted as a replacement: placeholders
 * (also in the bracketless form used inside code), synthetic values and code
 * aliases.
 */
export function knownReplacementTokens(sources: KnownReplacementSources): Set<string> {
  const known = new Set<string>();
  const add = (token: string | undefined): void => {
    if (!token) return;
    known.add(token);
    known.add(bareIdentifierPlaceholder(token));
  };

  for (const record of sources.vault?.records ?? []) {
    add(record.placeholder);
    add(record.syntheticValue);
  }
  for (const [token] of sources.entityMap?.entries() ?? []) add(token);
  for (const map of sources.mappings ?? []) {
    for (const token of Object.keys(map)) add(token);
  }
  for (const token of sources.extra ?? []) add(token);
  return known;
}

/** Spans whose text is itself a replacement token, dropped. */
export function dropKnownReplacements(spans: readonly PiiSpan[], known: ReadonlySet<string>): PiiSpan[] {
  if (known.size === 0) return [...spans];
  return spans.filter((span) => !known.has(span.text.trim()));
}

/**
 * The known placeholders `text` already contains, bracketed or in the
 * bracketless code form. New placeholders for the same text have to be
 * numbered around them, or a new name could be given a label that already
 * stands for someone else in it.
 */
export function placeholdersInText(text: string, known: ReadonlySet<string>): ParsedPlaceholder[] {
  const found: ParsedPlaceholder[] = [];
  for (const token of known) {
    const parsed = parsePlaceholder(token);
    if (parsed && (text.includes(token) || text.includes(bareIdentifierPlaceholder(token)))) found.push(parsed);
  }
  return found;
}

/**
 * The form two copies of one text are compared in. The clipboard turns line
 * breaks into `\r\n` on Windows, and composers trim surrounding blank lines.
 */
export function normalizeForMatch(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

/**
 * A short, stable fingerprint of `text` (cyrb53), so a history entry can be
 * recognised even when only the start of its text is kept.
 */
export function textFingerprint(text: string): string {
  const normalized = normalizeForMatch(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${normalized.length.toString(36)}-${hash.toString(36)}`;
}
