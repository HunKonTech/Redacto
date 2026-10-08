import { CONFIDENT_LANGUAGE, highlightCode, type KnownLanguage } from './code-language';
import { findCodeLikeRegions } from './code-identifiers';
import { codeBody, detectRegionLanguage } from './code-rename';

/**
 * Syntax colouring for the code in a text field (side panel: the text to
 * anonymize and its result, the reply to restore and the restored text).
 *
 * Only languages recognised with high confidence are coloured: a region's
 * own (`CONFIDENT_LANGUAGE`), otherwise the one language every confident
 * region of the related fields agrees on (`confidentLanguage`), so a short
 * fragment in a reply is coloured like the fenced block it was pasted with.
 * Prose around the code stays plain.
 */

/** A coloured stretch of text, in UTF-16 indices. */
export interface SyntaxRun {
  start: number;
  end: number;
  kind: SyntaxKind;
}

export type SyntaxKind = 'keyword' | 'string' | 'number' | 'comment' | 'title' | 'type' | 'literal' | 'meta' | 'variable';

/** highlight.js scopes (`hljs-…`) and the few colours they share. */
const KIND_OF_SCOPE: Record<string, SyntaxKind> = {
  keyword: 'keyword', 'selector-tag': 'keyword', tag: 'keyword', section: 'keyword', doctag: 'keyword',
  string: 'string', regexp: 'string', char: 'string', 'template-tag': 'string', symbol: 'string', link: 'string',
  number: 'number',
  comment: 'comment', quote: 'comment',
  title: 'title', name: 'title', 'selector-id': 'title', 'selector-class': 'title',
  type: 'type', built_in: 'type', class: 'type',
  literal: 'literal', bullet: 'literal',
  meta: 'meta', attr: 'meta', attribute: 'meta', 'selector-attr': 'meta', 'selector-pseudo': 'meta',
  variable: 'variable', 'template-variable': 'variable', property: 'variable', params: 'variable', subst: 'variable',
};

/** Region languages, keeping only confident ones. */
function confidentRegions(text: string): { start: number; end: number; language: KnownLanguage | undefined }[] {
  return findCodeLikeRegions(text).map((region) => {
    const guess = detectRegionLanguage(text, region);
    const body = codeBody(text, region);
    const confident = guess.language !== 'unknown' && guess.confidence >= CONFIDENT_LANGUAGE;
    return { start: body.start, end: body.end, language: confident ? (guess.language as KnownLanguage) : undefined };
  });
}

/**
 * The language every confidently recognised code region of `texts` agrees
 * on; undefined when there is none or they disagree.
 */
export function confidentLanguage(texts: readonly string[]): KnownLanguage | undefined {
  const languages = new Set(
    texts.flatMap((text) => confidentRegions(text).flatMap((region) => (region.language ? [region.language] : []))),
  );
  return languages.size === 1 ? [...languages][0] : undefined;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };

/** Coloured runs of highlight.js HTML, offset by `base`; null when its text is not `code`. */
function runsOfHtml(html: string, code: string, base: number): SyntaxRun[] | null {
  const runs: SyntaxRun[] = [];
  const scopes: (SyntaxKind | undefined)[] = [];
  let offset = 0;
  let plain = '';
  const add = (piece: string) => {
    let kind: SyntaxKind | undefined;
    for (let i = scopes.length - 1; i >= 0 && !kind; i -= 1) kind = scopes[i];
    if (kind) {
      const last = runs[runs.length - 1];
      if (last && last.kind === kind && last.end === base + offset) last.end += piece.length;
      else runs.push({ start: base + offset, end: base + offset + piece.length, kind });
    }
    plain += piece;
    offset += piece.length;
  };
  for (const match of html.matchAll(/<span class="([^"]*)">|<\/span>|&(#?\w+);|[^<&]+/g)) {
    if (match[1] !== undefined) {
      const scope = match[1].split(/\s+/)[0].replace(/^hljs-/, '');
      scopes.push(KIND_OF_SCOPE[scope]);
    } else if (match[0] === '</span>') scopes.pop();
    else if (match[2] !== undefined) add(ENTITIES[match[2]] ?? match[0]);
    else add(match[0]);
  }
  return plain === code ? runs : null;
}

/**
 * The coloured runs of `text`'s code regions, sorted. Regions without a
 * confident language of their own use `sharedLanguage`, when given.
 */
export function syntaxRuns(text: string, sharedLanguage?: KnownLanguage): SyntaxRun[] {
  const runs: SyntaxRun[] = [];
  for (const region of confidentRegions(text)) {
    const language = region.language ?? sharedLanguage;
    if (!language || region.end <= region.start) continue;
    const code = text.slice(region.start, region.end);
    runs.push(...(runsOfHtml(highlightCode(code, language), code, region.start) ?? []));
  }
  return runs;
}

/** A piece of text to render, coloured when `kind` is set. */
export interface SyntaxPiece {
  text: string;
  kind?: SyntaxKind;
}

/** `text` cut at the edges of `runs` (sorted, non-overlapping). */
export function syntaxPieces(text: string, runs: readonly SyntaxRun[], from = 0, to = text.length): SyntaxPiece[] {
  const pieces: SyntaxPiece[] = [];
  let cursor = from;
  for (const run of runs) {
    if (run.end <= cursor || run.start >= to) continue;
    const start = Math.max(run.start, cursor);
    const end = Math.min(run.end, to);
    if (start > cursor) pieces.push({ text: text.slice(cursor, start) });
    pieces.push({ text: text.slice(start, end), kind: run.kind });
    cursor = end;
  }
  if (cursor < to) pieces.push({ text: text.slice(cursor, to) });
  return pieces;
}
