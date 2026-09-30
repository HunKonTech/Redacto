/**
 * Split text around resolver matches so the side panel can mark them without
 * building HTML strings.
 */

import { groupForEntity } from '../shared/category-groups';
import type { EntityType } from '../shared/message-types';
import type { ResolveResult } from '../shared/placeholder-resolver';

export interface Segment {
  text: string;
  mark?: {
    /** Category group, lower-case and dashed (`identity`, `low-signal`). */
    tone: string;
    /** The other side of the pair, shown on hover. */
    title: string;
  };
}

/** Colour group for a resolver `styleKey` (a lower-cased entity type, or `misc`). */
export function toneFor(styleKey: string): string {
  const group = groupForEntity(styleKey.toUpperCase() as EntityType);
  return (group ?? 'Low-signal').toLowerCase();
}

/**
 * `side: 'original'` renders the restored text with each original marked;
 * `side: 'token'` renders `text` itself with each token marked.
 */
export function segmentsOf(text: string, result: ResolveResult, side: 'original' | 'token'): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of result.matches) {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start) });
    segments.push({
      text: side === 'original' ? match.originalText : match.matchText,
      mark: {
        tone: toneFor(match.styleKey),
        title: side === 'original' ? match.matchText : match.originalText,
      },
    });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
