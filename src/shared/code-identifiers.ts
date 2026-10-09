import { findCodeRegions, type CodeRegion } from './code-region-finder';
import { findErrorRegions, parseErrorSlots, subtractRegions } from './error-trace';
import type { PiiSpan } from './message-types';
import { byteOffsetToStringIndex, stringIndexToByteOffset } from './text-offsets';

/**
 * Helpers that let the prose-trained Local AI model read source code, and
 * keep the replacements it produces valid code.
 *
 * The model reads `getAnnaMuellerInvoice` as one opaque token. Splitting
 * identifiers into words (`get Anna Mueller Invoice`) lets it recognize the
 * name inside; the spans it returns are mapped back onto the original text.
 */

const CODE_LINE_KEYWORD_RE =
  /^(?:import|from|export|package|using|#include|def|class|interface|enum|struct|impl|fn|func|function|const|let|var|val|public|private|protected|static|return|if|elif|else|for|while|switch|case|try|catch|except|finally|async|await|raise|throw)\b/;
const CODE_LINE_END_RE = /(?:[;{}]|\)\s*:|=>|\(\s*)$/;
const CODE_LINE_OPERATOR_RE =
  /=>|->|::|\(\);|!==|===|&&|\|\||\{\s*(?:get|set|init)\s*;|^[A-Za-z_$][\w$]*(?:\.[\w$]+)*\s*(?:=|\+=|:=)\s*[^=\s]/;
/**
 * An indented member declared by annotation: `first_name: str`,
 * `age?: number = 0`. Counts only inside a run of code — at the start of a
 * line of prose it is a label (`Name: Anna`).
 */
const MEMBER_LINE_RE = /^\s+[A-Za-z_$][\w$]*[?!]?\s*:\s*[A-Za-z_$][\w$.]*(?:[[<].*[\]>])?\??\s*(?:=\s*\S.*)?[;,]?\s*$/;
/** A line that is nothing but a call: `print(x)`, `app.run(debug=True);`. */
const CODE_LINE_CALL_RE = /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*\(.*\)\s*;?$/;

/**
 * Several `;`-terminated statements on one line: `int a = 1; var b = a;`.
 * Code pasted into a single-line box (a search field) arrives like this.
 */
const MULTI_STATEMENT_LINE_RE = /^[^;]*[\w)\]'"]\s*;\s*\S.*;\s*$/;

function isMultiStatementLine(line: string): boolean {
  const trimmed = line.trim();
  return MULTI_STATEMENT_LINE_RE.test(trimmed) && /[=(]/.test(trimmed);
}

/**
 * A sentence boundary followed by a code-starting keyword, where prose ends
 * and code begins on the same line: `… it is defined there. let x = 1;`.
 */
const PROSE_TO_CODE_RE = new RegExp(`[.!?:]\\s+(?=${CODE_LINE_KEYWORD_RE.source.slice(1)})`, 'g');
/** Words that are code, not prose, even when they stand alone. */
const CODE_WORDS = new Set(
  (
    CODE_LINE_KEYWORD_RE.source.match(/[a-z]+/g)!.join(' ') +
    ' in is not and or new of as int string void bool boolean char long double float null true false'
  ).split(' '),
);

/** Whether `text` has three plain words in a row, none of them a code word. */
function looksLikeProse(text: string): boolean {
  let run = 0;
  for (const word of text.split(/\s+/)) {
    const bare = word.replace(/,$/, '');
    run = /^\p{L}+$/u.test(bare) && !CODE_WORDS.has(bare) ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
}

/**
 * Length of the prose a line starts with before its code
 * (`Why does this fail? let x = 1;` → up to `let`), or 0.
 */
function proseLeadLength(line: string): number {
  let lead = 0;
  for (const match of line.matchAll(PROSE_TO_CODE_RE)) {
    const codeStart = match.index! + match[0].length;
    if (looksLikeProse(line.slice(lead, match.index! + 1))) lead = codeStart;
  }
  return lead;
}

const IDENTIFIER_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const IDENTIFIER_CHAR_RE = /[\p{L}\p{N}_$]/u;
const IDENTIFIER_TEXT_RE = /^[\p{L}\p{N}_$]+$/u;

/**
 * One line that is unmistakably code on its own: a code operator or call
 * together with a keyword start or a code line ending, as in
 * `public string? Name => first ?? last;`. A lone keyword or `;` is not
 * enough — prose has those too.
 */
function isStrongCodeLine(line: string): boolean {
  const trimmed = line.trim();
  const hasCodeToken = CODE_LINE_OPERATOR_RE.test(trimmed) || CODE_LINE_CALL_RE.test(trimmed);
  const hasCodeFrame = CODE_LINE_KEYWORD_RE.test(trimmed) || CODE_LINE_END_RE.test(trimmed);
  return hasCodeToken && hasCodeFrame;
}

function isCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  return (
    CODE_LINE_KEYWORD_RE.test(trimmed) ||
    CODE_LINE_END_RE.test(trimmed) ||
    CODE_LINE_OPERATOR_RE.test(trimmed) ||
    CODE_LINE_CALL_RE.test(trimmed)
  );
}

/** A `//` or `/* … *\/` comment line: inside code it does not end the code. */
function isCommentLine(line: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*)/.test(line);
}

/**
 * Fenced / `<pre>` regions plus runs of unfenced lines that look like code.
 * A run needs at least two code-looking lines — or one line holding several
 * statements, or one unmistakable code line; blank lines, comment lines and indented continuation lines inside a run do
 * not break it, and indented member lines (`first_name: str`) inside a run
 * count as code. Prose leading into code on the same line is left out.
 */
export function findCodeLikeRegions(text: string): CodeRegion[] {
  const regions = [...findCodeRegions(text)];

  let offset = 0;
  let runStart = -1;
  let runEnd = -1;
  let runCodeLines = 0;
  const closeRun = () => {
    if (runStart !== -1 && runCodeLines >= 2) regions.push({ start: runStart, end: runEnd });
    runStart = -1;
    runCodeLines = 0;
  };

  for (const fullLine of text.split('\n')) {
    const lineEnd = offset + fullLine.length;
    const lead = proseLeadLength(fullLine);
    const line = fullLine.slice(lead);
    if (lead > 0) closeRun();
    if (isCodeLine(line) || (runStart !== -1 && MEMBER_LINE_RE.test(line))) {
      if (runStart === -1) runStart = offset + lead;
      runEnd = lineEnd;
      runCodeLines += isMultiStatementLine(line) || isStrongCodeLine(line) ? 2 : 1;
    } else if (runStart !== -1 && line.trim() !== '' && !/^\s/.test(line) && !isCommentLine(line)) {
      closeRun();
    }
    offset = lineEnd + 1;
  }
  closeRun();

  return mergeRegions(regions);
}

function mergeRegions(regions: CodeRegion[]): CodeRegion[] {
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  const merged: CodeRegion[] = [];
  for (const region of sorted) {
    const last = merged[merged.length - 1];
    if (last && region.start <= last.end) {
      last.end = Math.max(last.end, region.end);
    } else {
      merged.push({ ...region });
    }
  }
  return merged;
}

function inRegions(regions: readonly CodeRegion[], start: number, end: number): boolean {
  return regions.some((region) => start >= region.start && end <= region.end);
}

/**
 * Words identifiers are commonly built from. The model sometimes reads them
 * as a name (`UserData` in `UserDataViewModel` as a person); a flagged part
 * made only of these words is not personal data. Words that are also common
 * first names (`max`, `will`, `mark`, `grant`) are left out on purpose.
 */
const GENERIC_IDENTIFIER_WORDS: ReadonlySet<string> = new Set([
  'abstract', 'access', 'account', 'accounts', 'action', 'active', 'activity', 'adapter', 'add',
  'address', 'admin', 'age', 'agent', 'alias', 'all', 'api', 'app', 'application', 'archive',
  'area', 'async', 'attribute', 'audit', 'auth', 'author', 'avatar', 'base', 'basic', 'billing',
  'binding', 'birth', 'birthday', 'body', 'booking', 'builder', 'button', 'cache', 'card', 'cart',
  'case', 'category', 'child', 'city', 'class', 'client', 'clients', 'code', 'collection',
  'command', 'comment', 'common', 'company', 'component', 'config', 'configuration', 'connection',
  'contact', 'contacts', 'container', 'content', 'context', 'contract', 'control', 'controller',
  'core', 'count', 'country', 'create', 'created', 'credential', 'credentials', 'current',
  'customer', 'customers', 'dao', 'dashboard', 'data', 'database', 'date', 'default', 'delete',
  'department', 'description', 'detail', 'details', 'device', 'dialog', 'display', 'document',
  'domain', 'dto', 'edit', 'editor', 'email', 'emails', 'employee', 'employees', 'entity', 'entry',
  'error', 'event', 'events', 'factory', 'family', 'field', 'file', 'filter', 'find', 'first',
  'form', 'full', 'gender', 'get', 'given', 'group', 'groups', 'guest', 'handler', 'has', 'header',
  'helper', 'history', 'home', 'id', 'identity', 'image', 'impl', 'info', 'information', 'init',
  'input', 'invoice', 'is', 'item', 'items', 'job', 'key', 'last', 'layout', 'list', 'load',
  'local', 'location', 'log', 'logger', 'login', 'mail', 'main', 'manager', 'map', 'mapper',
  'member', 'members', 'message', 'meta', 'middle', 'mobile', 'mock', 'modal', 'model', 'models',
  'module', 'my', 'name', 'names', 'new', 'nick', 'nickname', 'node', 'number', 'object', 'old',
  'on', 'option', 'options', 'order', 'orders', 'organization', 'output', 'owner', 'panel',
  'parent', 'partner', 'password', 'patient', 'payment', 'people', 'permission', 'person',
  'personal', 'persons', 'phone', 'photo', 'picture', 'post', 'postal', 'preferences', 'primary',
  'private', 'product', 'profile', 'profiles', 'property', 'provider', 'proxy', 'public', 'query',
  'record', 'records', 'register', 'registration', 'remove', 'report', 'repo', 'repository',
  'request', 'resolver', 'resource', 'response', 'result', 'role', 'roles', 'root', 'save',
  'schema', 'screen', 'search', 'secondary', 'security', 'selected', 'service', 'session', 'set',
  'settings', 'setup', 'shared', 'sign', 'signup', 'source', 'staff', 'state', 'status', 'store',
  'street', 'student', 'subscriber', 'summary', 'surname', 'table', 'target', 'task', 'team',
  'teams', 'teacher', 'temp', 'template', 'tenant', 'test', 'title', 'to', 'token', 'type',
  'update', 'updated', 'user', 'username', 'users', 'util', 'utils', 'validator', 'value', 'view',
  'viewer', 'views', 'vm', 'widget', 'wrapper', 'zip',
]);

/** Lower-case words of an identifier: `UserDataViewModel` → `user`, `data`, `view`, `model`. */
function identifierWords(name: string): string[] {
  return name
    .split(/[\s_$\p{N}]+|(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/**
 * Drops model spans in code that are made only of generic identifier words
 * (`UserData` in `UserDataViewModel`, `customerName`). A span counts as code
 * when it sits in a code region, is glued to a longer identifier, or is a
 * compound identifier itself; a lone word in prose is the model's call.
 */
export function dropGenericIdentifierSpans(
  text: string,
  regions: readonly CodeRegion[],
  spans: readonly PiiSpan[],
): PiiSpan[] {
  return spans.filter((span) => {
    if (span.source !== 'ner') return true;
    const start = byteOffsetToStringIndex(text, span.start);
    const end = byteOffsetToStringIndex(text, span.end);
    const original = text.slice(start, end);
    if (!IDENTIFIER_TEXT_RE.test(original)) return true;
    const words = identifierWords(original);
    if (words.length === 0 || !words.every((word) => GENERIC_IDENTIFIER_WORDS.has(word))) return true;
    const glued = IDENTIFIER_CHAR_RE.test(text[start - 1] ?? '') || IDENTIFIER_CHAR_RE.test(text[end] ?? '');
    return !(glued || words.length > 1 || inRegions(regions, start, end));
  });
}

/** Split an identifier into its words: `getHTTPResponse_v2` → `get`, `HTTP`, `Response`, `v2`. */
function identifierWordBreaks(identifier: string): { replace: Set<number>; insertBefore: Set<number> } {
  const replace = new Set<number>();
  const insertBefore = new Set<number>();
  for (let i = 0; i < identifier.length; i += 1) {
    const ch = identifier[i];
    if (ch === '_' || ch === '$') {
      replace.add(i);
      continue;
    }
    const prev = identifier[i - 1];
    const next = identifier[i + 1];
    if (i === 0 || prev === '_' || prev === '$') continue;
    const isUpper = /[A-Z]/.test(ch);
    if (isUpper && /[a-z0-9]/.test(prev)) insertBefore.add(i);
    else if (isUpper && /[A-Z]/.test(prev) && next !== undefined && /[a-z]/.test(next)) insertBefore.add(i);
  }
  return { replace, insertBefore };
}

export interface NerTextView {
  /** Text handed to the NER model. */
  text: string;
  /** For each UTF-16 index of `text`, the index in the original text. */
  toOriginal: number[];
}

/** Build the model-facing view of `text` with identifiers in code regions split into words. */
export function buildIdentifierSplitView(text: string, regions: readonly CodeRegion[]): NerTextView {
  let view = '';
  const toOriginal: number[] = [];
  let cursor = 0;

  const copy = (from: number, to: number) => {
    for (let i = from; i < to; i += 1) {
      view += text[i];
      toOriginal.push(i);
    }
  };

  for (const region of regions) {
    const segment = text.slice(region.start, region.end);
    IDENTIFIER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IDENTIFIER_RE.exec(segment)) !== null) {
      const start = region.start + match.index;
      const { replace, insertBefore } = identifierWordBreaks(match[0]);
      if (replace.size === 0 && insertBefore.size === 0) continue;

      copy(cursor, start);
      for (let i = 0; i < match[0].length; i += 1) {
        if (insertBefore.has(i)) {
          view += ' ';
          toOriginal.push(start + i);
        }
        view += replace.has(i) ? ' ' : match[0][i];
        toOriginal.push(start + i);
      }
      cursor = start + match[0].length;
    }
  }
  copy(cursor, text.length);
  toOriginal.push(text.length);

  return { text: view, toOriginal };
}

/** Map spans (byte offsets into `view.text`) back onto the original text. */
export function mapViewSpansToOriginal(
  spans: readonly PiiSpan[],
  view: NerTextView,
  originalText: string,
): PiiSpan[] {
  const mapped: PiiSpan[] = [];
  for (const span of spans) {
    const viewStart = byteOffsetToStringIndex(view.text, span.start);
    const viewEnd = byteOffsetToStringIndex(view.text, span.end);
    if (viewEnd <= viewStart) continue;

    let start = view.toOriginal[viewStart];
    let end = view.toOriginal[viewEnd - 1] + 1;
    // A word boundary `_` sits at the edge of the model's span as a space.
    while (start < end && originalText[start] === '_') start += 1;
    while (end > start && originalText[end - 1] === '_') end -= 1;
    if (end <= start) continue;

    mapped.push({
      ...span,
      start: stringIndexToByteOffset(originalText, start),
      end: stringIndexToByteOffset(originalText, end),
      text: originalText.slice(start, end),
    });
  }
  return mapped;
}

/** True when `start` begins a word of an identifier (camelCase, snake_case, or token start). */
function startsIdentifierWord(text: string, start: number): boolean {
  const before = text[start - 1];
  if (before === undefined || !IDENTIFIER_CHAR_RE.test(before) || before === '_' || before === '$') return true;
  return /[A-Z]/.test(text[start]) && /[a-z0-9]/.test(before);
}

/** True when `end` ends a word of an identifier. */
function endsIdentifierWord(text: string, end: number): boolean {
  const after = text[end];
  if (after === undefined || !IDENTIFIER_CHAR_RE.test(after) || after === '_' || after === '$') return true;
  return /[A-Z0-9]/.test(after) && /[a-z]/.test(text[end - 1]);
}

/**
 * Once the model flags a word inside one identifier, flag every other
 * occurrence of that word in identifiers across the code regions. The same
 * name must be replaced everywhere or the pasted code stops compiling.
 */
export function propagateIdentifierSpans(
  text: string,
  regions: readonly CodeRegion[],
  spans: readonly PiiSpan[],
): PiiSpan[] {
  const occupied = spans.map((span) => ({
    start: byteOffsetToStringIndex(text, span.start),
    end: byteOffsetToStringIndex(text, span.end),
  }));
  const added: PiiSpan[] = [];

  const seeds = new Map<string, PiiSpan>();
  for (const span of spans) {
    if (span.source !== 'ner' || !IDENTIFIER_TEXT_RE.test(span.text)) continue;
    const start = byteOffsetToStringIndex(text, span.start);
    if (!inRegions(regions, start, start + span.text.length)) continue;
    const existing = seeds.get(span.text);
    if (!existing || span.score > existing.score) seeds.set(span.text, span);
  }

  for (const [needle, seed] of seeds) {
    for (const region of regions) {
      let from = region.start;
      while (true) {
        const start = text.indexOf(needle, from);
        if (start === -1 || start + needle.length > region.end) break;
        from = start + 1;
        const end = start + needle.length;
        if (!startsIdentifierWord(text, start) || !endsIdentifierWord(text, end)) continue;
        if (occupied.some((o) => start < o.end && end > o.start)) continue;
        occupied.push({ start, end });
        added.push({
          ...seed,
          start: stringIndexToByteOffset(text, start),
          end: stringIndexToByteOffset(text, end),
          text: needle,
        });
      }
    }
  }

  return [...spans, ...added];
}

/**
 * Whether the line prefix before `index` leaves it inside a string literal
 * or a line comment. Conservative: when unsure, answer false, because the
 * bracket-less placeholder is valid everywhere while `[TYPE_N]` is only
 * valid inside strings and comments.
 */
function insideStringOrComment(text: string, lineStart: number, index: number): boolean {
  let quote: string | null = null;
  for (let i = lineStart; i < index; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '/' && text[i + 1] === '/') return true;
    else if (ch === '#' && (i === lineStart || /\s/.test(text[i - 1]))) return true;
  }
  if (!quote) return false;
  // Only trust the string when it also closes after the span on this line.
  const lineEnd = text.indexOf('\n', index);
  return text.slice(index, lineEnd === -1 ? undefined : lineEnd).includes(quote);
}

/**
 * The code in `text` — code-like regions without the error output in them
 * (stack traces, diagnostics: see `error-trace.ts`), plus the source lines
 * that error output quotes — and the error output itself.
 */
function codeAndErrorRegions(text: string): { code: CodeRegion[]; errors: CodeRegion[] } {
  const errors = findErrorRegions(text);
  if (errors.length === 0) return { code: findCodeLikeRegions(text), errors };
  const echoes = parseErrorSlots(text, errors)
    .filter((slot) => slot.kind === 'echo')
    .map(({ start, end }) => ({ start, end }));
  return { code: mergeRegions([...subtractRegions(findCodeLikeRegions(text), errors), ...echoes]), errors };
}

/**
 * Returns a predicate telling whether a replacement at [start, end) (UTF-16
 * indices) sits in identifier position — inside code, outside strings and
 * comments, or glued to identifier characters. There a bracketed
 * placeholder would break the code, so the caller emits `TYPE_N` instead.
 * Error output is prose: there only a position glued to a name counts
 * (`at Acme.GetAnnaMuellerInvoice()`).
 */
export function createIdentifierPositionCheck(
  text: string,
): (start: number, end: number) => boolean {
  let regions: { code: CodeRegion[]; errors: CodeRegion[] } | null = null;
  return (start, end) => {
    regions ??= codeAndErrorRegions(text);
    const before = text[start - 1];
    const after = text[end];
    const glued = (before && IDENTIFIER_CHAR_RE.test(before)) || (after && IDENTIFIER_CHAR_RE.test(after));
    if (!inRegions(regions.code, start, end)) return Boolean(glued) && inRegions(regions.errors, start, end);
    if (glued) return true;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    return !insideStringOrComment(text, lineStart, start);
  };
}

/**
 * A name the model flagged inside a longer identifier stands for the whole
 * identifier: replacing only the part (`UserDataViewModel` →
 * `PERSON_1ViewModel`) leaves the rest of the name behind and reads as a
 * half-renamed symbol. Each such span is widened to the identifier it sits
 * in, at every occurrence of that identifier, so the name is replaced whole
 * and the same way everywhere — also where the model split it differently
 * (`GitHub` in one place, `Git` + `Hub` in another) or missed it. The type
 * and score come from the longest part. Other spans pass through.
 */
export function consistentIdentifierSpans(text: string, spans: readonly PiiSpan[]): PiiSpan[] {
  const inIdentifierPosition = createIdentifierPositionCheck(text);
  const flagged = new Map<string, PiiSpan>();
  const cover = (span: PiiSpan) => span.end - span.start;
  for (const span of spans) {
    const start = byteOffsetToStringIndex(text, span.start);
    const end = byteOffsetToStringIndex(text, span.end);
    if (!inIdentifierPosition(start, end)) continue;
    let wordStart = start;
    let wordEnd = end;
    while (wordStart > 0 && IDENTIFIER_CHAR_RE.test(text[wordStart - 1])) wordStart--;
    while (wordEnd < text.length && IDENTIFIER_CHAR_RE.test(text[wordEnd])) wordEnd++;
    if (wordStart === start && wordEnd === end) continue;
    const word = text.slice(wordStart, wordEnd);
    if (!IDENTIFIER_TEXT_RE.test(word)) continue;
    const best = flagged.get(word);
    if (!best || cover(span) > cover(best) || (cover(span) === cover(best) && span.score > best.score)) {
      flagged.set(word, span);
    }
  }
  if (flagged.size === 0) return [...spans];

  const result: PiiSpan[] = [...spans];
  for (const [word, flag] of flagged) {
    const occurrence = new RegExp(`(?<![\\p{L}\\p{N}_$])${escapeRegExp(word)}(?![\\p{L}\\p{N}_$])`, 'gu');
    for (const match of text.matchAll(occurrence)) {
      const byteStart = stringIndexToByteOffset(text, match.index!);
      const byteEnd = stringIndexToByteOffset(text, match.index! + word.length);
      const overlapping = result.filter((span) => span.start < byteEnd && span.end > byteStart);
      // A span reaching past the name ("GitHub Inc" in prose) is left alone.
      if (overlapping.some((span) => span.start < byteStart || span.end > byteEnd)) continue;
      for (const span of overlapping) result.splice(result.indexOf(span), 1);
      result.push({ ...flag, start: byteStart, end: byteEnd, text: word });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `[PERSON_1]` → `PERSON_1`; other replacements are returned unchanged. */
export function bareIdentifierPlaceholder(placeholder: string): string {
  return /^\[[A-Z][A-Z_]*_\d+\]$/.test(placeholder) ? placeholder.slice(1, -1) : placeholder;
}
