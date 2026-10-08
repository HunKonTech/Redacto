import { findCodeLikeRegions } from './code-identifiers';
import { detectCodeLanguage, fenceLabelOf, hasReliableDeclarations, type CodeLanguage, type LanguageGuess } from './code-language';
import { activeProfiles, languageLexicon, type Lexicon } from './code-lexicon';
import type { CodeRegion } from './code-region-finder';
import {
  errorRegionCodeTexts,
  findErrorRegions,
  parseErrorSlots,
  subtractRegions,
  type ErrorRegion,
  type ErrorSlot,
} from './error-trace';
import type { IdentifierVerdict } from './identifier-classifier-constants';

/**
 * Consistent renaming of a pasted snippet's own identifiers: the names it
 * declares, and the names it uses without declaring or importing them that
 * are not well-known library names (they are declared elsewhere in the
 * user's project).
 *
 * The analysis is lexical and language-agnostic (C-family, Python, JS/TS,
 * Java, C#, Go, Rust, Kotlin, PHP shapes). It only has to be good enough to
 * pick the snippet's *own* names: correctness of the round trip does not
 * depend on it, because every alias is restored to exactly the name it
 * replaced. A missed name leaks that name; a wrongly renamed library name
 * only confuses the model until the reply is restored.
 *
 * Error output pasted with the code (stack traces, exception lines, compiler
 * diagnostics — see `error-trace.ts`) is not analysed as code: its frames
 * add the user's own namespaces, classes and methods, and the names it
 * quotes get the same aliases as in the code, while its prose stays as is.
 *
 * Official names are recognised from the region's detected language
 * (`code-language.ts`) and the library profiles the paste activates
 * (`code-lexicon`). An undeclared name is decided in this order:
 *   1. the snippet declares it → own;
 *   2. it is imported → external;
 *   3. the language lexicon or an active profile has it → library;
 *   4. it is a member of a library receiver (`$.each`, a `$(…)` value) → library;
 *   5. it is an option key of a library call (`$.ajax({ url })`) → library;
 *   6. the identifier-classifier model's verdict;
 *   7. the hardcoded `LIBRARY_NAMES` fallback.
 * Steps 3–5 only ever rename less; a declaration always wins.
 */

export type IdentifierRole = 'class' | 'function' | 'variable' | 'field' | 'param' | 'constant' | 'namespace';

export interface RenameOccurrence {
  /** UTF-16 index into the analysed text. */
  start: number;
  end: number;
  name: string;
}

export interface RenamePlan {
  /** Every renamed name with the role of its first declaration. */
  roles: Map<string, IdentifierRole>;
  occurrences: RenameOccurrence[];
  /** Every identifier-shaped word in the code, for alias collision checks. */
  identifiersInText: Set<string>;
  /** The detected language of each analysed code region, in order. */
  languages: CodeLanguage[];
  /** Ids of the library profiles the paste activated. */
  profiles: string[];
}

type TokenKind = 'ident' | 'string' | 'comment' | 'number' | 'punct' | 'newline';

interface Token {
  kind: TokenKind;
  start: number;
  end: number;
  text: string;
}

const KEYWORDS = new Set(
  (
    'abstract and as assert async await base begin break case catch class const constructor continue ' +
    'crate debugger declare def default defer del delete do dyn elif else end enum except explicit export ' +
    'extends extern fallthrough final finally fn for foreach from fun func function get global go goto if ' +
    'impl implements import in init inline instanceof interface internal is lambda let loop match mod ' +
    'module mut namespace native new nonlocal not object of operator or out override package params partial ' +
    'pass private protected pub public raise readonly record ref register require return sealed select self ' +
    'set sizeof static struct super switch synchronized template then this throw throws trait transient try ' +
    'type typedef typeof typename union unsafe use using val var virtual volatile when where while ' +
    'with yield true false null nil none None True False undefined NaN Infinity cls it ' +
    'lateinit suspend tailrec vararg crossinline noinline reified'
  ).split(' '),
);

/** Built-in type names: they precede a declared name in typed declarations. */
const TYPE_KEYWORDS = new Set(
  (
    'void int uint long ulong short ushort byte sbyte char bool boolean double float decimal string ' +
    'object dynamic auto var let val const signed unsigned size_t i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 ' +
    'usize isize str any unknown never number bigint symbol'
  ).split(' '),
);

/**
 * Names renaming would break: receivers, entry points and the members a
 * runtime calls by name. Every other name the code declares is renamed,
 * however generic (`value`, `i`, `args`) — a generic name costs nothing to
 * rename and the user asked for all of them.
 */
const RESERVED_NAMES = new Set(
  (
    '_ main Main self this $this cls super base constructor prototype toString equals hashCode ToString Equals ' +
    'GetHashCode Dispose DisposeAsync'
  ).split(' '),
);

/** Python built-ins: in code that cannot be Python (`;` line ends, `===`) they are left to renaming. */
const PYTHON_LIBRARY_NAMES = new Set(
  (
    'print len range str int float bool list dict set tuple frozenset bytes bytearray open input isinstance ' +
    'issubclass enumerate zip map filter sorted reversed sum min max abs round any all iter next hasattr ' +
    'getattr setattr delattr callable repr hash id format vars dir globals locals staticmethod classmethod ' +
    'property Exception ValueError TypeError KeyError IndexError RuntimeError AttributeError StopIteration ' +
    'NotImplementedError OSError IOError FileNotFoundError ZeroDivisionError AssertionError'
  ).split(' '),
);

/** Python built-in names that other languages share (`print`, `len`, `range`, `bytes` in Go, `Exception` in C#/Java). */
const SHARED_BUILTIN_NAMES = new Set(
  'print len range bytes min max abs round format open map filter zip Exception TypeError AssertionError'.split(' '),
);

/** Names every language's code may use for a library: `$`, `jQuery`, `_`, `console`, `Math`, `JSON`. */
const UNIVERSAL_LIBRARY_NAMES = new Set(['$', 'jQuery', 'JQuery', 'JQueryStatic', '_', 'console', 'Math', 'JSON']);

/**
 * Standard-library and runtime names a snippet uses without declaring or
 * importing them, the fallback after the language lexicons and profiles
 * (`code-lexicon`). Every other undeclared name is taken to be the user's
 * own (declared elsewhere in their project) and renamed.
 */
const OTHER_LIBRARY_NAMES = new Set(
  (
    // JavaScript / TypeScript
    '$ jQuery JQuery JQueryStatic ' +
    'console Math JSON Object Array String Number Boolean Promise Date Error RegExp Map Set WeakMap WeakSet ' +
    'Symbol BigInt Reflect Proxy Intl window document globalThis navigator location localStorage ' +
    'sessionStorage fetch setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone ' +
    'parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI require ' +
    'module exports process Buffer URL URLSearchParams Headers Request Response FormData Blob File Event ' +
    'Element HTMLElement Node AbortController TextEncoder TextDecoder Record Partial Required Readonly Pick ' +
    'Omit Exclude Extract ReturnType Parameters Awaited NonNullable Uint8Array ArrayBuffer ' +
    // C# / .NET
    'Console Task ValueTask List Dictionary HashSet IEnumerable IList ICollection IDictionary IReadOnlyList ' +
    'IReadOnlyCollection IReadOnlyDictionary IQueryable Func Action Predicate DateTime DateTimeOffset TimeSpan ' +
    'Guid Int32 Int64 Double Decimal Convert Environment Enumerable Nullable Lazy Tuple ValueTuple ' +
    'CancellationToken StringBuilder Encoding Path Directory Stream Uri HttpClient ILogger IServiceCollection ' +
    'IConfiguration ArgumentException ArgumentNullException InvalidOperationException NotSupportedException ' +
    'NotImplementedException IDisposable Attribute nameof Regex Thread Debug Trace IOptions ConcurrentDictionary ' +
    'ConcurrentQueue StringComparer StringComparison CultureInfo JsonSerializer IActionResult ActionResult ' +
    'ControllerBase Controller HttpContext IHostedService BackgroundService ILoggerFactory IServiceProvider ' +
    // Java / Kotlin
    'System Integer Long Short Byte Character Float Optional ArrayList LinkedList HashMap TreeMap ' +
    'Collections Arrays Objects Stream Collectors Override Deprecated FunctionalInterface Thread Runnable ' +
    'RuntimeException IllegalArgumentException IllegalStateException NullPointerException IOException ' +
    'println listOf mutableListOf mapOf mutableMapOf setOf arrayOf lazy require check Int UInt ULong Unit Any ' +
    'Nothing ' +
    // Go / Rust
    'fmt make append cap copy panic recover error errors strings strconv context time ' +
    'Some Ok Err Option Result Vec Box Rc Arc RefCell Cell HashMap BTreeMap HashSet Default Clone Debug ' +
    'Copy PartialEq Eq Hash Iterator IntoIterator From Into Display ToString Send Sync Sized vec ' +
    'format_args assert_eq assert_ne unwrap expect'
  ).split(' '),
);

const LIBRARY_NAMES = new Set([...PYTHON_LIBRARY_NAMES, ...OTHER_LIBRARY_NAMES]);

/** Python built-ins no other language has as a free name. */
const PYTHON_ONLY_LIBRARY_NAMES = new Set(
  [...PYTHON_LIBRARY_NAMES].filter((name) => !SHARED_BUILTIN_NAMES.has(name) && !OTHER_LIBRARY_NAMES.has(name)),
);

/**
 * What counts as an official name in one code region: its language's
 * lexicon, the active library profiles that apply to that language, and the
 * hardcoded fallback list (without Python's built-ins when the region cannot
 * be Python). An `unknown` region has no language lexicon: only the
 * universal names, the profiles and the full fallback list — the behaviour
 * from before languages were detected.
 */
class SymbolScope {
  private readonly lexicons: Lexicon[];
  private readonly withoutPythonBuiltins: boolean;

  constructor(
    readonly language: CodeLanguage,
    ruledOut: readonly CodeLanguage[],
    profiles: readonly Lexicon[],
  ) {
    const lexicon = languageLexicon(language);
    this.lexicons = [...(lexicon ? [lexicon] : []), ...profiles.filter((profile) => profile.appliesTo(language))];
    this.withoutPythonBuiltins = language === 'unknown' ? ruledOut.includes('python') : language !== 'python';
  }

  /**
   * The language's own official names when its declarations cannot be told
   * from keywords and built-ins (`hasReliableDeclarations`); empty otherwise.
   */
  unrenameableNames(): ReadonlySet<string> {
    if (hasReliableDeclarations(this.language)) return new Set();
    return languageLexicon(this.language)?.names ?? new Set();
  }

  /** Step 3: the language lexicon, an active profile, or a universal name. */
  isOfficial(name: string): boolean {
    return UNIVERSAL_LIBRARY_NAMES.has(name) || this.lexicons.some((lexicon) => lexicon.names.has(name));
  }

  /** A library module used as a receiver: `np.array`, `path.join`, `os.getenv`. */
  isNamespace(name: string): boolean {
    return this.lexicons.some((lexicon) => lexicon.namespaces.has(name));
  }

  /** A library type's member, recognised after any receiver: `rows.filter`, `df.groupby`, `q.Where`. */
  isValueMember(name: string): boolean {
    return this.lexicons.some((lexicon) => lexicon.valueMembers.has(name));
  }

  isOptionKey(name: string): boolean {
    return this.lexicons.some((lexicon) => lexicon.optionKeys.has(name));
  }

  /** Step 7: the hardcoded list. */
  isFallbackLibraryName(name: string): boolean {
    if (this.withoutPythonBuiltins && PYTHON_ONLY_LIBRARY_NAMES.has(name)) return false;
    return LIBRARY_NAMES.has(name);
  }
}

const MEMBER_ACCESS = ['.', '?.', '->', '::'];

/** Shells: bare words are commands, flags and cmdlets; only `$variables` are the user's. */
const SHELL_LANGUAGES = new Set<CodeLanguage>(['bash', 'powershell']);

const DECLARING_KEYWORDS: Record<string, IdentifierRole> = {
  class: 'class',
  struct: 'class',
  interface: 'class',
  enum: 'class',
  record: 'class',
  trait: 'class',
  type: 'class',
  object: 'class',
  def: 'function',
  function: 'function',
  fn: 'function',
  func: 'function',
  fun: 'function',
  let: 'variable',
  var: 'variable',
  val: 'variable',
  const: 'variable',
  auto: 'variable',
};

const ROLE_PRIORITY: Record<IdentifierRole, number> = {
  param: 0,
  namespace: 1,
  variable: 2,
  constant: 3,
  field: 4,
  function: 5,
  class: 6,
};

const MODIFIERS = new Set(
  'public private protected internal static readonly const final volatile transient abstract sealed virtual override async unsafe extern partial required lateinit open pub declare'.split(' '),
);

/** Soft keywords that only modify a type or function declaration: Kotlin `data class`, `companion object`. */
const TYPE_MODIFIERS = new Set('data sealed inner value annotation companion open inline'.split(' '));
const TYPE_DECLARING = new Set(['class', 'object', 'interface', 'fun']);

const IDENT_START_RE = /[\p{L}_$]/u;
const IDENT_PART_RE = /[\p{L}\p{N}_$]/u;

// --- Lexer -----------------------------------------------------------------

const TWO_CHAR_PUNCT = new Set(['=>', '->', '::', '?.', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', ':=', '&&', '||', '??', '**']);

/**
 * How a region's double-quoted strings interpolate variables:
 * `sigil` — `"$name"` names the variable `$name` (shells, PHP, Perl);
 * `bare` — `"$name"` and `"${expr}"` name `name` and code (Kotlin, Groovy, Dart).
 */
type DollarInterpolation = 'none' | 'sigil' | 'bare';

const DOLLAR_INTERPOLATION: Partial<Record<CodeLanguage, DollarInterpolation>> = {
  bash: 'sigil', powershell: 'sigil', php: 'sigil', perl: 'sigil',
  kotlin: 'bare', groovy: 'bare', dart: 'bare',
};

class Lexer {
  readonly tokens: Token[] = [];
  private dollar: DollarInterpolation = 'none';

  constructor(private readonly text: string) {}

  lex(start: number, end: number, dollar: DollarInterpolation = 'none'): void {
    this.dollar = dollar;
    let i = start;
    while (i < end) {
      i = this.lexOne(i, end);
    }
    this.dollar = 'none';
  }

  /** Lex one token at `i`; returns the next index. */
  private lexOne(i: number, end: number): number {
    const text = this.text;
    const ch = text[i];

    if (ch === '\n') {
      this.push('newline', i, i + 1);
      return i + 1;
    }
    if (/\s/.test(ch)) return i + 1;

    if (ch === '/' && text[i + 1] === '/') return this.lineComment(i, end);
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const stop = close === -1 || close + 2 > end ? end : close + 2;
      this.push('comment', i, stop);
      return stop;
    }
    if (ch === '#') {
      const before = text[i - 1];
      // `this.#field`, `#[attr]` are code; everything else (`# comment`,
      // `#include`, `#region`) is a comment or a directive.
      if (before === '.' || text[i + 1] === '[' || (before && IDENT_PART_RE.test(before))) {
        this.push('punct', i, i + 1);
        return i + 1;
      }
      return this.lineComment(i, end);
    }

    if (IDENT_START_RE.test(ch)) {
      let j = i + 1;
      while (j < end && IDENT_PART_RE.test(text[j])) j += 1;
      const word = text.slice(i, j);
      const quote = text[j];
      if ((quote === '"' || quote === "'") && /^(?:[rRbBuUfF]{1,2}|[$@]{1,2})$/.test(word)) {
        return this.string(i, j, end, /[fF$]/.test(word), word.includes('@'));
      }
      this.push('ident', i, j);
      return j;
    }
    if ((ch === '$' || ch === '@') && (text[i + 1] === '"' || (text[i + 1] === '@' || text[i + 1] === '$') && text[i + 2] === '"')) {
      const quoteAt = text[i + 1] === '"' ? i + 1 : i + 2;
      return this.string(i, quoteAt, end, text.slice(i, quoteAt).includes('$'), text.slice(i, quoteAt).includes('@'));
    }
    if (ch === '"' || ch === '`') return this.string(i, i, end, ch === '`', false);
    if (ch === "'") {
      // A char literal or string when it closes on this line; otherwise a
      // Rust lifetime or an apostrophe.
      const lineEnd = text.indexOf('\n', i);
      const closeAt = this.findClosingQuote(i + 1, lineEnd === -1 ? end : Math.min(lineEnd, end), "'");
      if (closeAt !== -1) return this.string(i, i, end, false, false);
      this.push('punct', i, i + 1);
      return i + 1;
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < end && /[0-9A-Za-z_.]/.test(text[j])) j += 1;
      this.push('number', i, j);
      return j;
    }
    const two = text.slice(i, i + 2);
    if (TWO_CHAR_PUNCT.has(two)) {
      this.push('punct', i, i + 2);
      return i + 2;
    }
    this.push('punct', i, i + 1);
    return i + 1;
  }

  private lineComment(i: number, end: number): number {
    const lineEnd = this.text.indexOf('\n', i);
    const stop = lineEnd === -1 || lineEnd > end ? end : lineEnd;
    this.push('comment', i, stop);
    return stop;
  }

  private findClosingQuote(from: number, to: number, quote: string): number {
    for (let k = from; k < to; k += 1) {
      if (this.text[k] === '\\') {
        k += 1;
        continue;
      }
      if (this.text[k] === quote) return k;
    }
    return -1;
  }

  /**
   * Lex a string literal whose opening quote is at `quoteAt` (prefix from
   * `start`). Interpolated parts (`${x}`, `{x}` in f-strings and C# `$""`)
   * are lexed as code so identifiers inside them are renamed too.
   */
  private string(start: number, quoteAt: number, end: number, interpolated: boolean, verbatim: boolean): number {
    const text = this.text;
    const quote = text[quoteAt];
    const triple = text.slice(quoteAt, quoteAt + 3) === quote.repeat(3);
    const delimiter = triple ? quote.repeat(3) : quote;
    const multiline = triple || quote === '`' || verbatim;
    let segmentStart = start;
    let k = quoteAt + delimiter.length;

    while (k < end) {
      const c = text[k];
      if (!multiline && c === '\n') break;
      if (c === '\\' && !verbatim) {
        k += 2;
        continue;
      }
      if (verbatim && c === quote && text[k + 1] === quote) {
        k += 2;
        continue;
      }
      if (text.startsWith(delimiter, k)) {
        k += delimiter.length;
        break;
      }
      const opensInterpolation =
        interpolated &&
        ((quote === '`' && c === '$' && text[k + 1] === '{') || (quote !== '`' && c === '{' && text[k + 1] !== '{'));
      if (interpolated && quote !== '`' && c === '{' && text[k + 1] === '{') {
        k += 2;
        continue;
      }
      if (opensInterpolation) {
        const bodyStart = quote === '`' ? k + 2 : k + 1;
        this.push('string', segmentStart, bodyStart);
        k = this.interpolation(bodyStart, end);
        segmentStart = k;
        continue;
      }
      if (this.dollar !== 'none' && quote === '"' && !verbatim && c === '$') {
        if (this.dollar === 'bare' && text[k + 1] === '{') {
          this.push('string', segmentStart, k + 2);
          k = this.interpolation(k + 2, end);
          segmentStart = k;
          continue;
        }
        if (IDENT_START_RE.test(text[k + 1] ?? '') && text[k + 1] !== '$') {
          let j = k + 2;
          while (j < end && IDENT_PART_RE.test(text[j]) && text[j] !== '$') j += 1;
          const nameStart = this.dollar === 'sigil' ? k : k + 1;
          this.push('string', segmentStart, nameStart);
          this.push('ident', nameStart, j);
          segmentStart = j;
          k = j;
          continue;
        }
      }
      k += 1;
    }
    this.push('string', segmentStart, Math.min(k, end));
    return Math.min(k, end);
  }

  /** Lex code up to the `}` that closes an interpolation; returns the index after it. */
  private interpolation(from: number, end: number): number {
    let depth = 0;
    let k = from;
    while (k < end) {
      const c = this.text[k];
      if (c === '}') {
        if (depth === 0) return k + 1;
        depth -= 1;
      } else if (c === '{') {
        depth += 1;
      }
      if (c === '{' || c === '}') {
        this.push('punct', k, k + 1);
        k += 1;
        continue;
      }
      k = this.lexOne(k, end);
    }
    return k;
  }

  private push(kind: TokenKind, start: number, end: number): void {
    if (end > start) this.tokens.push({ kind, start, end, text: this.text.slice(start, end) });
  }
}

// --- Analysis ----------------------------------------------------------------

/** Code tokens without comments; newlines kept for statement starts. */
function significant(tokens: readonly Token[]): Token[] {
  return tokens.filter((token) => token.kind !== 'comment');
}

function isName(token: Token | undefined): boolean {
  return token?.kind === 'ident' && !KEYWORDS.has(token.text);
}

function isTypeLike(token: Token | undefined): boolean {
  if (!token) return false;
  if (token.kind === 'ident') return !KEYWORDS.has(token.text) || TYPE_KEYWORDS.has(token.text);
  return token.text === '>' || token.text === ']' || token.text === '?' || token.text === '*' || token.text === '&';
}

/**
 * Whether an undeclared name is a library/framework name in `scope`: a
 * lexicon or profile name is (step 3); otherwise the identifier-classifier
 * model's verdict decides when it had an opinion on this exact name
 * (step 6), and the hardcoded list when it did not or is unavailable (step 7).
 */
function isLibraryName(name: string, scope: SymbolScope, classifications?: ReadonlyMap<string, IdentifierVerdict>): boolean {
  if (scope.isOfficial(name)) return true;
  const verdict = classifications?.get(name);
  if (verdict) return verdict === 'LIB';
  return scope.isFallbackLibraryName(name);
}

/** A code body and the scope its names are judged in. */
interface ScopedRange {
  start: number;
  end: number;
  scope: SymbolScope;
}

class Analyzer {
  private readonly code: Token[];
  readonly roles = new Map<string, IdentifierRole>();
  readonly external = new Set<string>();
  /** Imported from the user's own modules (`from './invoice'`, `from .models`): external, but not a library. */
  private readonly relativeImports = new Set<string>();
  private readonly overrides = new Set<string>();
  private readonly classifications?: ReadonlyMap<string, IdentifierVerdict>;
  /** Declared names holding a library value (`const items = $(…)`, `el: JQuery`): their members are the library's. */
  private readonly libValued = new Set<string>();
  /** Callback and loop variables over the user's own data (`orders.map(o => …)`): their members are the user's. */
  private ownValued = new Set<string>();

  constructor(
    tokens: readonly Token[],
    classifications?: ReadonlyMap<string, IdentifierVerdict>,
    private readonly text?: string,
    private readonly scopes: readonly ScopedRange[] = [],
    private readonly defaultScope: SymbolScope = new SymbolScope('unknown', [], []),
    /** Official names of languages whose declarations are unreliable: never renamed. */
    private readonly unrenameable: ReadonlySet<string> = new Set(),
  ) {
    this.code = significant(tokens);
    this.classifications = classifications;
  }

  /** The scope of the code body token i is in. */
  private scopeAt(i: number): SymbolScope {
    const offset = this.code[i]?.start;
    if (offset === undefined) return this.defaultScope;
    let low = 0;
    let high = this.scopes.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const range = this.scopes[mid];
      if (offset < range.start) high = mid - 1;
      else if (offset >= range.end) low = mid + 1;
      else return range.scope;
    }
    return this.defaultScope;
  }

  private isLibraryName(name: string, i: number): boolean {
    return isLibraryName(name, this.scopeAt(i), this.classifications);
  }

  /** Index of the previous non-newline token. */
  private prevIndex(i: number): number {
    let j = i - 1;
    while (j >= 0 && this.code[j].kind === 'newline') j -= 1;
    return j;
  }

  private nextIndex(i: number): number {
    let j = i + 1;
    while (j < this.code.length && this.code[j].kind === 'newline') j += 1;
    return j;
  }

  private prev(i: number): Token | undefined {
    return this.code[this.prevIndex(i)];
  }

  private next(i: number): Token | undefined {
    return this.code[this.nextIndex(i)];
  }

  /**
   * Whether the token before i can end a type. A `?` only does when glued to
   * it (`string? name`); a spaced one is a ternary (`c ? a : b`).
   */
  private typeLikeBefore(i: number): boolean {
    const beforeIndex = this.prevIndex(i);
    const before = this.code[beforeIndex];
    if (!isTypeLike(before)) return false;
    if (before.text !== '?') return true;
    const typeEnd = this.code[beforeIndex - 1];
    return typeEnd !== undefined && typeEnd.end === before.start && typeEnd.kind !== 'newline';
  }

  /** True when token i starts a statement (line start, or after `;`/`{`/`}`). */
  private startsStatement(i: number): boolean {
    const before = this.code[i - 1];
    return !before || before.kind === 'newline' || [';', '{', '}'].includes(before.text);
  }

  /** Record a declaration; a name seen in several roles keeps the most specific one. */
  private declare(name: string, role: IdentifierRole): void {
    const current = this.roles.get(name);
    if (!current || ROLE_PRIORITY[role] > ROLE_PRIORITY[current]) this.roles.set(name, role);
    // A PHP property `$name` is read as `$this->name`.
    if (role === 'field' && /^\$\w/.test(name)) this.declare(name.slice(1), 'field');
  }

  analyze(): void {
    const code = this.code;
    for (let i = 0; i < code.length; i += 1) {
      const token = code[i];
      if (token.text === '=>') {
        this.declareArrowParams(i);
        continue;
      }
      if (token.kind !== 'ident') continue;

      if (this.collectImports(i)) continue;

      const declaring = DECLARING_KEYWORDS[token.text];
      if (declaring) {
        this.declareAfterKeyword(i, declaring);
        continue;
      }
      if (!isName(token)) continue;

      const before = this.prev(i);
      const after = this.next(i);
      const afterIndex = this.nextIndex(i);

      // `self.x = …` / `this.x = …` → field
      if (before?.text === '.' && ['self', 'this'].includes(this.prev(this.prevIndex(i))?.text ?? '')) {
        if (after && ['=', ':'].includes(after.text)) this.declare(token.text, 'field');
        continue;
      }
      if (before && MEMBER_ACCESS.includes(before.text)) continue;

      // Go struct fields: `FirstName string`, `ID, Name string \`json:"id"\``.
      // Before the typed rule, which would read the previous line's type as
      // this name's.
      if (this.startsStatement(i) && this.inClassBody(i)) {
        const fields = this.goFieldNames(i);
        if (fields) {
          for (const name of fields) this.declare(name, 'field');
          continue;
        }
      }

      // Typed declaration: `Type name =|;|,|)|{|=>|:`, `Type name(` (method).
      if (this.typeLikeBefore(i) && after) {
        const typeToken = before!;
        const isModifierOnly = typeToken.kind === 'ident' && MODIFIERS.has(typeToken.text);
        if (!isModifierOnly && !(typeToken.kind === 'ident' && ['return', 'new', 'await', 'yield', 'throw', 'else', 'case', 'in', 'is', 'as', 'of'].includes(typeToken.text))) {
          if (after.text === '(') {
            if (this.hasModifier(i, 'override')) this.overrides.add(token.text);
            else this.declare(token.text, 'function');
            this.declareParams(afterIndex);
            continue;
          }
          const context = ['=', ';', ',', ')', '{', '=>', ':'].includes(after.text)
            ? this.typedDeclarationContext(i)
            : null;
          if (context === 'parens') {
            this.declare(token.text, 'param');
            continue;
          }
          if (context === 'statement') {
            this.declare(token.text, this.inClassBody(i) || this.hasAnyModifier(i) ? 'field' : 'variable');
            continue;
          }
        }
      }

      // Members declared inside a type body, after any modifiers and
      // decorators: `customerId: string;`, `private name?: string`,
      // `pub id: u32,` (TypeScript, Kotlin, Swift, Rust, Python dataclasses),
      // and untyped `private $name;` / `static count;` (PHP, JS).
      const memberStart = this.startsMemberDeclaration(i);
      if (memberStart && after && [':', '?', '!'].includes(after.text) && this.inTypeBody(i)) {
        this.declare(token.text, 'field');
        continue;
      }
      if (memberStart && after && [';', ','].includes(after.text) && this.inClassBody(i)) {
        if (after.text === ';' || this.hasAnyModifier(i)) {
          this.declare(token.text, 'field');
          continue;
        }
      }

      // Python / JS / Go statement-level assignment: `name = …`, `name := …`,
      // class attributes (`debug = False`, `static count = 0;`), and
      // `for name in …`.
      if (memberStart && after && ['=', ':='].includes(after.text)) {
        const role = isScreamingCase(token.text) ? 'constant' : this.inTypeBody(i) ? 'field' : 'variable';
        if (role === 'field' || this.startsStatement(i)) {
          this.declare(token.text, role);
          continue;
        }
      }
      if (before?.text === 'for' && after && ['in', 'of', ',', ':'].includes(after.text)) {
        this.declare(token.text, 'variable');
      }
    }
    this.collectLibValued();
  }

  // --- Library and own values (decision steps 4 and 5) ----------------------

  private brackets?: { partner: Int32Array; enclosing: Int32Array };

  /**
   * Bracket structure, computed once: the partner of every bracket and the
   * innermost opener around every token (-1 when none). A closer that does
   * not match the innermost opener is ignored.
   */
  private bracketIndex(): { partner: Int32Array; enclosing: Int32Array } {
    if (this.brackets) return this.brackets;
    const partner = new Int32Array(this.code.length).fill(-1);
    const enclosing = new Int32Array(this.code.length).fill(-1);
    const stack: number[] = [];
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    for (let j = 0; j < this.code.length; j += 1) {
      const text = this.code[j].text;
      const opener = pairs[text];
      if (opener && stack.length > 0 && this.code[stack[stack.length - 1]].text === opener) {
        const open = stack.pop()!;
        partner[open] = j;
        partner[j] = open;
      }
      enclosing[j] = stack.length > 0 ? stack[stack.length - 1] : -1;
      if (text === '(' || text === '[' || text === '{') stack.push(j);
    }
    this.brackets = { partner, enclosing };
    return this.brackets;
  }

  /** Index of the opener matching the closer at `close`, or -1. */
  private matchingOpen(close: number): number {
    return this.bracketIndex().partner[close];
  }

  private matchingClose(open: number): number {
    return this.bracketIndex().partner[open];
  }

  /** Index of the innermost unclosed `(`, `[` or `{` before token i, or -1. */
  private enclosingOpen(i: number): number {
    return this.bracketIndex().enclosing[i];
  }

  /**
   * The first name of the member chain ending at token `end`:
   * `$('#cart').find('li')` → `$`, `jQuery.ajax` → `jQuery`. -1 when the
   * chain starts with something else (`(a || b).x`, a literal).
   */
  private chainRoot(end: number): number {
    let j = end;
    for (;;) {
      let token = this.code[j];
      if (!token) return -1;
      if (token.text === ')' || token.text === ']') {
        const open = this.matchingOpen(j);
        if (open < 0) return -1;
        j = this.prevIndex(open);
        token = this.code[j];
      }
      if (token?.kind !== 'ident') return -1;
      const before = this.code[this.prevIndex(j)];
      if (!before || !['.', '?.', '::'].includes(before.text)) {
        return KEYWORDS.has(token.text) && token.text !== 'this' && token.text !== 'self' ? -1 : j;
      }
      j = this.prevIndex(this.prevIndex(j));
    }
  }

  /** Whether a chain rooted at the name at token i yields library values. */
  private isLibRoot(i: number): boolean {
    const name = this.code[i].text;
    if (this.libValued.has(name)) return true;
    if (this.roles.has(name)) return false;
    if (this.external.has(name)) return !this.relativeImports.has(name);
    return this.isLibraryName(name, i) || (this.next(i)?.text === '.' && this.scopeAt(i).isNamespace(name));
  }

  /**
   * Whether the call whose `(` is at `open` calls the library: its chain is
   * rooted in a library name or value (`jQuery.ajax(`, `$(sel).css(`,
   * `requests.get(`), or it calls a library type's method (`df.groupby(`).
   */
  private isLibCall(open: number): boolean {
    const calleeEnd = this.prevIndex(open);
    const callee = this.code[calleeEnd];
    if (!callee || (callee.kind !== 'ident' && callee.text !== ')')) return false;
    const isMethod = ['.', '?.'].includes(this.prev(calleeEnd)?.text ?? '');
    // `if (`, `for (` — but `requests.get(` is a call.
    if (callee.kind === 'ident' && !isMethod && KEYWORDS.has(callee.text) && callee.text !== 'require') return false;
    const root = this.chainRoot(calleeEnd);
    if (root >= 0 && this.isLibRoot(root)) return true;
    return callee.kind === 'ident' && isMethod && this.scopeAt(calleeEnd).isValueMember(callee.text);
  }

  /**
   * Step 5: a known option key of a library call — `$.ajax({ url: … })`,
   * `requests.get(u, timeout=5)`. Only keys of the options object itself;
   * nested objects are data.
   */
  private isLibOptionKey(i: number): boolean {
    const after = this.next(i);
    const before = this.prev(i);
    if (!after || !before || !this.scopeAt(i).isOptionKey(this.code[i].text)) return false;
    const open = this.enclosingOpen(i);
    if (open < 0) return false;
    if (after.text === ':' && ['{', ','].includes(before.text) && this.code[open].text === '{') {
      if (!['(', ','].includes(this.prev(open)?.text ?? '')) return false;
      const call = this.enclosingOpen(open);
      return call >= 0 && this.code[call].text === '(' && this.isLibCall(call);
    }
    // Keyword and named arguments: `timeout=5`, `name: value`.
    if ((after.text === '=' || after.text === ':') && ['(', ','].includes(before.text) && this.code[open].text === '(') {
      return this.isLibCall(open);
    }
    return false;
  }

  /**
   * Declared names that hold a library value: assigned from a library chain
   * (`const items = $(sel)`, `r = requests.get(u)`, `const y = items.find('li')`)
   * or annotated with a library type (`el: JQuery<HTMLElement>`).
   */
  private collectLibValued(): void {
    const code = this.code;
    for (let i = 0; i < code.length; i += 1) {
      const token = code[i];
      if (!isName(token) || !this.roles.has(token.text)) continue;
      const before = this.prev(i);
      if (before && MEMBER_ACCESS.includes(before.text)) continue;
      const afterIndex = this.nextIndex(i);
      const after = code[afterIndex];
      if (!after) continue;
      if (after.text === '=' || after.text === ':=') {
        let j = this.nextIndex(afterIndex);
        while (code[j] && ['new', 'await'].includes(code[j].text)) j = this.nextIndex(j);
        if (code[j]?.kind === 'ident' && !KEYWORDS.has(code[j].text) && this.isLibRoot(j)) this.libValued.add(token.text);
      } else if (after.text === ':') {
        const type = code[this.nextIndex(afterIndex)];
        if (isName(type) && !this.roles.has(type!.text) && this.isLibraryName(type!.text, i)) this.libValued.add(token.text);
      }
    }
  }

  /** The parameter tokens of the callback whose `=>` is at `arrow`, and where they start. */
  private arrowParams(arrow: number): { start: number; params: number[] } | null {
    const beforeIndex = this.prevIndex(arrow);
    const before = this.code[beforeIndex];
    if (isName(before)) return { start: beforeIndex, params: [beforeIndex] };
    if (before?.text !== ')') return null;
    const open = this.matchingOpen(beforeIndex);
    return open < 0 ? null : { start: open, params: this.paramNames(open) };
  }

  /** Name tokens at the top level of the parentheses opened at `open`. */
  private paramNames(open: number): number[] {
    const close = this.matchingClose(open);
    const out: number[] = [];
    for (let j = open + 1; j < close; j += 1) {
      if (this.enclosingOpen(j) !== open || !isName(this.code[j])) continue;
      if (['(', ','].includes(this.prev(j)?.text ?? '') && [',', ')', ':', '='].includes(this.next(j)?.text ?? '')) out.push(j);
    }
    return out;
  }

  /**
   * Whether the call at `open` runs over the user's own data: its receiver
   * chain (`customers.Where(…)`) or one of its bare arguments
   * (`$.each(orders, …)`) is an own name.
   */
  private callOverOwn(open: number, isOwn: (name: string) => boolean, skip: ReadonlySet<number>): boolean {
    const calleeEnd = this.prevIndex(open);
    const root = this.chainRoot(calleeEnd);
    if (root >= 0 && root !== calleeEnd && isOwn(this.code[root].text)) return true;
    const close = this.matchingClose(open);
    for (let j = open + 1; j < close; j += 1) {
      if (skip.has(j) || this.enclosingOpen(j) !== open || this.code[j].kind !== 'ident') continue;
      if (['(', ','].includes(this.prev(j)?.text ?? '') && [',', ')'].includes(this.next(j)?.text ?? '') && isOwn(this.code[j].text)) return true;
    }
    return false;
  }

  /**
   * Callback and loop variables whose values come from the user's own data:
   * `orders.map(o => …)`, `$.each(orders, (i, o) => …)`,
   * `customers.Where(c => …)`, `for o in orders:`. Members read through
   * them (`o.sum`, `c.IsActive`) are the user's fields.
   */
  private collectOwnValued(used: ReadonlyMap<string, IdentifierRole>): Set<string> {
    const own = new Set<string>();
    const isOwn = (name: string) => used.has(name) || own.has(name);
    const code = this.code;
    const mark = (params: number[]) => {
      for (const j of params) if (!this.libValued.has(code[j].text)) own.add(code[j].text);
    };
    for (let i = 0; i < code.length; i += 1) {
      const text = code[i].text;
      let callback: { start: number; params: number[] } | null = null;
      if (text === '=>') callback = this.arrowParams(i);
      else if (text === 'function' && this.next(i)?.text === '(') callback = { start: i, params: this.paramNames(this.nextIndex(i)) };
      else if (text === 'lambda') {
        const params: number[] = [];
        for (let j = i + 1; j < code.length && code[j].text !== ':'; j += 1) if (isName(code[j])) params.push(j);
        callback = { start: i, params };
      } else if ((text === 'in' || text === 'of') && isName(this.next(i))) {
        // `for o in orders` / `for (const o of orders)`
        const variable = this.prevIndex(i);
        let k = this.prevIndex(variable);
        if (['const', 'let', 'var', 'val'].includes(code[k]?.text ?? '')) k = this.prevIndex(k);
        if (code[k]?.text === '(') k = this.prevIndex(k);
        if (code[k]?.text === 'for' && isName(code[variable]) && isOwn(this.next(i)!.text)) mark([variable]);
        continue;
      }
      if (!callback || callback.params.length === 0) continue;
      const open = this.enclosingOpen(callback.start);
      if (open < 0 || code[open].text !== '(') continue;
      if (this.callOverOwn(open, isOwn, new Set(callback.params))) mark(callback.params);
    }
    return own;
  }

  /** `x => …` and `(a, b) => …` (JS/TS, C#, Java `->` is not handled). */
  private declareArrowParams(arrowIndex: number): void {
    const beforeIndex = this.prevIndex(arrowIndex);
    const before = this.code[beforeIndex];
    if (isName(before)) {
      this.declare(before!.text, 'param');
      return;
    }
    if (before?.text !== ')') return;
    let depth = 0;
    for (let j = beforeIndex; j >= 0; j -= 1) {
      if (this.code[j].text === ')') depth += 1;
      if (this.code[j].text === '(' && --depth === 0) {
        this.declareParams(j);
        return;
      }
    }
  }

  /** `import …`, `from … import …`, `using …;`, `require(…)` names stay untouched. */
  private collectImports(i: number): boolean {
    const token = this.code[i];
    if (!['import', 'from', 'using', 'require', 'package', 'namespace', 'use'].includes(token.text)) return false;
    if (!this.startsStatement(i) && token.text !== 'require') return false;
    let j = i + 1;
    const names: string[] = [];
    let relative = token.text === 'from' && this.code[j]?.text === '.';
    while (j < this.code.length && this.code[j].kind !== 'newline' && this.code[j].text !== ';') {
      const current = this.code[j];
      if (current.kind === 'ident') names.push(current.text);
      if (current.kind === 'string' && /^['"`](?:\.{1,2}\/|\/|~\/|@\/)/.test(current.text)) relative = true;
      j += 1;
    }
    for (const name of names) {
      this.external.add(name);
      if (relative) this.relativeImports.add(name);
    }
    return true;
  }

  private declareAfterKeyword(i: number, role: IdentifierRole): void {
    const nextIndex = this.nextIndex(i);
    const name = this.code[nextIndex];
    // `const string X = …` (C#) — the typed-declaration rule finds X.
    if (!isName(name) || TYPE_KEYWORDS.has(name!.text)) return;
    const keyword = this.code[i].text;
    // `type` / `object` / `record` are only declarations at statement level.
    if (['type', 'object', 'record'].includes(keyword) && !this.startsStatement(i) && !this.hasAnyModifier(i)) return;
    this.declare(name!.text, role === 'variable' && isScreamingCase(name!.text) ? 'constant' : role);
    const after = this.next(nextIndex);
    if (role === 'function' && after?.text === '(') this.declareParams(this.nextIndex(nextIndex));
    if (role === 'class' && after?.text === '(') this.declareParams(this.nextIndex(nextIndex));
  }

  /**
   * Parameters inside the parentheses opened at `openIndex`: the name right
   * before `,` `)` `=` `:` — untyped (`def f(a, b=1)`, `(a: number)`) or
   * after a type (`string name`, `IOptions<T> options`).
   */
  private declareParams(openIndex: number): void {
    let depth = 0;
    for (let j = openIndex; j < this.code.length; j += 1) {
      const token = this.code[j];
      if (['(', '[', '<', '{'].includes(token.text)) depth += 1;
      if ([')', ']', '>', '}'].includes(token.text)) {
        depth -= 1;
        if (depth === 0) return;
      }
      if (depth !== 1 || !isName(token)) continue;
      const after = this.next(j);
      const before = this.prev(j);
      if (!after || ![',', ')', '=', ':'].includes(after.text) || !before) continue;
      if (['(', ',', '*', '**', '&', '...'].includes(before.text) || this.typeLikeBefore(j)) {
        this.declare(token.text, 'param');
      }
    }
  }

  /**
   * Where a `Type name` pair sits: at the start of a statement (a variable or
   * field), inside parentheses (a parameter or tuple element), or neither.
   */
  private typedDeclarationContext(i: number): 'statement' | 'parens' | null {
    let j = this.prevIndex(i);
    let depth = 0;
    while (j >= 0) {
      const token = this.code[j];
      if (token.text === '>' || token.text === ']' || token.text === ')') depth += 1;
      else if (token.text === '<' || token.text === '[' || token.text === '(') {
        if (depth === 0) return token.text === '(' ? 'parens' : null;
        depth -= 1;
      } else if (depth === 0) {
        if (token.kind === 'newline' || [';', '{', '}'].includes(token.text)) return 'statement';
        if (token.text === ',') return 'parens';
        if (token.kind !== 'ident' && !['?', '*', '&', '.', '::'].includes(token.text)) return null;
      }
      j -= 1;
    }
    return 'statement';
  }

  /**
   * Whether token i starts a statement once the modifiers and decorators
   * before it are skipped: `private readonly name`, `@Input() name`.
   */
  private startsMemberDeclaration(i: number): boolean {
    let j = i - 1;
    while (j >= 0) {
      const token = this.code[j];
      if (token.kind === 'ident' && MODIFIERS.has(token.text)) {
        j -= 1;
        continue;
      }
      // `@Input()` / `@Input` on the member's own line.
      let k = j;
      if (token.text === ')') {
        let depth = 0;
        for (; k >= 0; k -= 1) {
          if (this.code[k].text === ')') depth += 1;
          if (this.code[k].text === '(' && --depth === 0) break;
        }
        k -= 1;
      }
      if (this.code[k]?.kind === 'ident' && this.code[k - 1]?.text === '@') {
        j = k - 2;
        continue;
      }
      break;
    }
    return this.startsStatement(j + 1);
  }

  /**
   * The names a Go struct field line declares: `Name Type`, `A, B Type`,
   * optionally followed by a tag. A line with `;`, `=`, `:` or a call is not
   * one — C-family fields end in `;`.
   */
  private goFieldNames(i: number): string[] | null {
    const names = [this.code[i].text];
    let j = i + 1;
    while (this.code[j]?.text === ',' && isName(this.code[j + 1])) {
      names.push(this.code[j + 1].text);
      j += 2;
    }
    const type = this.code[j];
    if (!type || type.kind === 'newline') return null;
    const typeStart =
      ['*', '['].includes(type.text) ||
      (type.kind === 'ident' && (isName(type) || TYPE_KEYWORDS.has(type.text) || ['func', 'interface', 'struct'].includes(type.text)));
    if (!typeStart) return null;
    for (let k = j; k < this.code.length && this.code[k].kind !== 'newline'; k += 1) {
      const text = this.code[k].text;
      if ([';', '=', ':=', ':', '=>', '->'].includes(text)) return null;
      if (text === '(' && type.text !== 'func') return null;
      // Only an empty `interface{}` / `struct{}`; a nested body is not a one-line field.
      if (text === '{' && this.code[k + 1]?.text !== '}') return null;
    }
    return names;
  }

  /** Whether token i is in a type body: braces, or a Python `class X:` block. */
  private inTypeBody(i: number): boolean {
    return this.inClassBody(i) || this.inIndentedClassBody(i);
  }

  /** Whether the nearest less-indented line above token i's line starts with `class`. */
  private inIndentedClassBody(i: number): boolean {
    const text = this.text;
    if (text === undefined) return false;
    const column = (index: number) => {
      const start = this.code[index].start;
      return start - (text.lastIndexOf('\n', start - 1) + 1);
    };
    const lineStart = (index: number) => {
      let j = index;
      while (j > 0 && this.code[j - 1].kind !== 'newline') j -= 1;
      return j;
    };
    const first = lineStart(i);
    const indent = column(first);
    if (indent === 0) return false;
    for (let j = first - 1; j >= 0; j -= 1) {
      if (this.code[j].kind === 'newline' || (j > 0 && this.code[j - 1].kind !== 'newline')) continue;
      if (column(j) < indent) return this.code[j].text === 'class';
    }
    return false;
  }

  /**
   * Whether token i is a modifier, not a name: `data class`, `open fun`,
   * `required string Name`.
   */
  private isModifierUse(i: number): boolean {
    const token = this.code[i];
    const after = this.next(i);
    if (TYPE_MODIFIERS.has(token.text) && TYPE_DECLARING.has(after?.text ?? '')) return true;
    return MODIFIERS.has(token.text) && after?.kind === 'ident' && (isName(after) || TYPE_KEYWORDS.has(after.text));
  }

  /** Whether token i names an argument of an annotation: `@Column(name = "x")`. */
  private inAnnotationArgs(i: number): boolean {
    if (this.next(i)?.text !== '=') return false;
    let depth = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const text = this.code[j].text;
      if (text === ')') depth += 1;
      else if (text === '(') {
        if (depth === 0) {
          const name = this.code[j - 1];
          return name?.kind === 'ident' && this.code[j - 2]?.text === '@';
        }
        depth -= 1;
      } else if (depth === 0 && [';', '{', '}'].includes(text)) {
        return false;
      }
    }
    return false;
  }

  private hasModifier(i: number, modifier: string): boolean {
    let j = this.prevIndex(i);
    while (j >= 0 && this.code[j].kind === 'ident') {
      if (this.code[j].text === modifier) return true;
      j = this.prevIndex(j);
    }
    return false;
  }

  private hasAnyModifier(i: number): boolean {
    let j = this.prevIndex(i);
    while (j >= 0 && this.code[j].kind !== 'newline' && ![';', '{', '}'].includes(this.code[j].text)) {
      if (MODIFIERS.has(this.code[j].text)) return true;
      j -= 1;
    }
    return false;
  }

  /** Whether the innermost `{` around token i was opened by a type declaration. */
  private inClassBody(i: number): boolean {
    let depth = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const token = this.code[j];
      if (token.text === '}') depth += 1;
      if (token.text !== '{') continue;
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      for (let k = j - 1; k >= 0 && ![';', '{', '}'].includes(this.code[k].text); k -= 1) {
        const text = this.code[k].text;
        if (['class', 'struct', 'interface', 'record', 'enum', 'object', 'trait', 'impl'].includes(text)) {
          return true;
        }
        // `type Customer = {` (TypeScript object type).
        if (text === 'type' && isName(this.code[k + 1]) && this.startsStatement(k)) return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Names the code uses without declaring them: the user's own classes,
   * properties and helpers from elsewhere in their project. Library and
   * runtime names stay. A member is included when its receiver is such a
   * name (`L.IsHu`); members of the snippet's local objects are not, since
   * they are as likely a library's (`rows.filter`).
   */
  usedNames(): Map<string, IdentifierRole> {
    const used = new Map<string, IdentifierRole>();
    const firstSeen = new Map<string, number>();
    const note = (name: string, role: IdentifierRole, i: number) => {
      const current = used.get(name);
      if (!current || ROLE_PRIORITY[role] > ROLE_PRIORITY[current]) used.set(name, role);
      if (!firstSeen.has(name) || firstSeen.get(name)! > i) firstSeen.set(name, i);
    };
    const candidate = (i: number) => {
      const token = this.code[i];
      return isName(token) && !this.roles.has(token.text) && !this.isLibraryName(token.text, i) && !this.excluded(token.text);
    };

    const members: number[] = [];
    for (let i = 0; i < this.code.length; i += 1) {
      const token = this.code[i];
      if (!candidate(i)) continue;
      const before = this.prev(i);
      if (before?.text === '@') continue;
      if (this.isModifierUse(i) || this.inAnnotationArgs(i)) continue;
      // `<?php`
      if (before?.text === '?' && this.prev(this.prevIndex(i))?.text === '<') continue;
      if (SHELL_LANGUAGES.has(this.scopeAt(i).language) && !token.text.startsWith('$')) continue;
      if (before && MEMBER_ACCESS.includes(before.text)) {
        members.push(i);
        continue;
      }
      // A library module as a receiver (`np.array`), an option key of a library call.
      if (this.next(i)?.text === '.' && this.scopeAt(i).isNamespace(token.text)) continue;
      if (this.isLibOptionKey(i)) continue;
      note(token.text, this.usedRole(i), i);
    }

    // Members of the user's own receivers are the user's, unless they are a
    // library type's (`orders.filter`, `df.groupby`); members of library
    // receivers and of other locals stay.
    this.ownValued = this.collectOwnValued(used);
    for (const i of members) {
      const receiver = this.prev(this.prevIndex(i));
      if (receiver?.kind !== 'ident' || !(used.has(receiver.text) || this.ownValued.has(receiver.text))) continue;
      if (this.scopeAt(i).isValueMember(this.code[i].text)) continue;
      note(this.code[i].text, this.next(i)?.text === '(' ? 'function' : 'field', i);
    }
    // In order of appearance, which is the order aliases are numbered in.
    return new Map([...used].sort(([a], [b]) => firstSeen.get(a)! - firstSeen.get(b)!));
  }

  /** Best guess at what an undeclared name is, from how it is used. */
  private usedRole(i: number): IdentifierRole {
    const name = this.code[i].text;
    const before = this.prev(i);
    const after = this.next(i);
    if (isScreamingCase(name)) return 'constant';
    const pascal = /^_*[A-Z]/.test(name);
    const typePosition =
      isName(after) || ['<', '>', '.', '::'].includes(after?.text ?? '') || before?.text === '<';
    if (before?.text === 'new' || (pascal && typePosition)) {
      return 'class';
    }
    if (after?.text === '(') return 'function';
    return pascal ? 'field' : 'variable';
  }

  /** Names that must never be renamed. */
  excluded(name: string): boolean {
    return (
      KEYWORDS.has(name) ||
      TYPE_KEYWORDS.has(name) ||
      RESERVED_NAMES.has(name) ||
      this.external.has(name) ||
      this.overrides.has(name) ||
      this.unrenameable.has(name) ||
      /^__.*__$/.test(name)
    );
  }

  /** Occurrences of renamed names in code tokens. */
  occurrences(renamed: ReadonlySet<string>): RenameOccurrence[] {
    const out: RenameOccurrence[] = [];
    const code = this.code;
    for (let i = 0; i < code.length; i += 1) {
      const token = code[i];
      if (token.kind !== 'ident' || !renamed.has(token.text)) continue;
      if (TYPE_MODIFIERS.has(token.text) && TYPE_DECLARING.has(this.next(i)?.text ?? '')) continue;
      const before = this.prev(i);
      if (before && ['.', '?.', '->', '::'].includes(before.text)) {
        // Member access follows the receiver: `alma.nev` and `self.nev` are
        // the snippet's own, `response.status_code` belongs to a library.
        const receiver = this.prev(this.prevIndex(i));
        const receiverIsOwn =
          receiver !== undefined &&
          !this.libValued.has(receiver.text) &&
          (['this', '$this', 'self', 'cls', ')', ']'].includes(receiver.text) || renamed.has(receiver.text));
        if (!receiverIsOwn) continue;
      }
      out.push({ start: token.start, end: token.end, name: token.text });
    }
    return out;
  }
}

function isScreamingCase(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name) && /[A-Z]/.test(name) && name.length > 1;
}

/** Strip a fenced block's ``` lines; other regions are analysed whole. */
function codeBody(text: string, region: CodeRegion): CodeRegion {
  let { start, end } = region;
  if (text.startsWith('```', start)) {
    const firstLineEnd = text.indexOf('\n', start);
    start = firstLineEnd === -1 ? end : firstLineEnd + 1;
    const lastLineStart = text.lastIndexOf('\n', end - 1) + 1;
    if (lastLineStart >= start && /^`{3,}\s*$/.test(text.slice(lastLineStart, end))) end = lastLineStart;
  }
  return { start, end: Math.max(start, end) };
}

/**
 * Word-boundary occurrences of renamed names inside comments. Declared names
 * need four letters or an identifier shape; undeclared ones need the shape
 * (`DescriptionEn`, `user_id`), so a free name like `data` leaves prose alone.
 */
function commentOccurrences(
  text: string,
  comments: readonly Token[],
  renamed: ReadonlySet<string>,
  undeclared: ReadonlySet<string>,
): RenameOccurrence[] {
  const out: RenameOccurrence[] = [];
  const identifierShaped = (name: string) => /[_A-Z0-9]/.test(name.slice(1));
  const candidates = [...renamed].filter((name) =>
    undeclared.has(name) ? identifierShaped(name) : name.length >= 4 || identifierShaped(name),
  );
  if (candidates.length === 0) return out;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_$])(?:${candidates.sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_$])`,
    'gu',
  );
  for (const comment of comments) {
    for (const match of comment.text.matchAll(pattern)) {
      const start = comment.start + (match.index ?? 0);
      out.push({ start, end: start + match[0].length, name: match[0] });
    }
  }
  return out;
}

/** The code bodies to analyse: code-like regions, fence lines and error output removed. */
function codeBodies(text: string, regions: readonly CodeRegion[], errorRegions: readonly ErrorRegion[]): CodeRegion[] {
  return subtractRegions(
    regions.map((region) => codeBody(text, region)),
    errorRegions,
  );
}

/**
 * Names error output adds: the segments of the user's own frames, and the
 * segments of an exception type rooted in one of their namespaces
 * (`Acme.Billing.InvoiceNotFoundException` next to `Acme.Billing…` frames).
 * Library frames and names that are excluded or library names add nothing.
 */
function errorTraceRoles(
  slots: readonly ErrorSlot[],
  own: (name: string) => boolean,
  known: ReadonlySet<string>,
): Map<string, IdentifierRole> {
  const roles = new Map<string, IdentifierRole>();
  const note = (slot: ErrorSlot) => {
    const role = slot.role ?? 'namespace';
    const current = roles.get(slot.name);
    if (!current || ROLE_PRIORITY[role] > ROLE_PRIORITY[current]) roles.set(slot.name, role);
  };
  const qualified = slots.filter((slot) => slot.kind === 'qualified' && !slot.libraryFrame && own(slot.name));
  for (const slot of qualified) {
    if (!slot.exceptionType) note(slot);
  }
  const exceptionGroups = new Map<number, ErrorSlot[]>();
  for (const slot of qualified) {
    if (!slot.exceptionType || slot.group === undefined) continue;
    exceptionGroups.set(slot.group, [...(exceptionGroups.get(slot.group) ?? []), slot]);
  }
  for (const group of exceptionGroups.values()) {
    const root = group[0].name;
    if (group.length > 1 && (roles.has(root) || known.has(root))) group.forEach(note);
  }
  return roles;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface RenamePlanOptions {
  /** Code regions to analyse; found automatically when omitted. */
  regions?: CodeRegion[];
  /**
   * Names renamed in earlier pastes. They are renamed here too, even when
   * this snippet only uses them, so a name keeps one alias throughout.
   */
  knownNames?: Iterable<string>;
  /**
   * OWN/LIB verdicts from the identifier-classifier model, keyed by exact
   * name. Only consulted for undeclared (used-but-not-declared) names that
   * no language lexicon or active profile knows — the snippet's own
   * declarations are always renamed regardless. A name absent from the map
   * falls back to the hardcoded `LIBRARY_NAMES` list, so a missing or
   * unavailable model degrades to the previous behaviour.
   */
  classifications?: ReadonlyMap<string, IdentifierVerdict>;
}

/** Matches every identifier-shaped word in a text, code or comment. */
export const IDENTIFIER_WORD_RE = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

/**
 * The trimmed text of every code-like region in `text` (fenced ``` markers
 * stripped) — the same regions and bodies `planIdentifierRenames` analyses —
 * followed by the frames of any error output, written as code
 * (`Acme.Billing.InvoiceService.LoadInvoice();`). Used to build the
 * identifier-classifier model's input: it needs the surrounding code as
 * context, not isolated names.
 */
export function extractCodeRegionTexts(text: string, regions?: CodeRegion[]): string[] {
  const errorRegions = findErrorRegions(text);
  const code = codeBodies(text, regions ?? findCodeLikeRegions(text), errorRegions)
    .map((body) => text.slice(body.start, body.end))
    .filter((body) => body.trim().length > 0);
  return [...code, ...errorRegionCodeTexts(text, errorRegions)];
}

/**
 * Find the identifiers the code in `text` declares and every place they
 * occur, across all code regions (so a class declared in one block and used
 * in another is renamed in both).
 */
/**
 * The language of a code region: its own `language` when the caller set it,
 * otherwise detected from its body (and fence label).
 */
export function detectRegionLanguage(text: string, region: CodeRegion): LanguageGuess {
  if (region.language) return { language: region.language, confidence: 1, source: 'fence', ruledOut: [] };
  const body = codeBody(text, region);
  return detectCodeLanguage(text.slice(body.start, body.end), { fenceLabel: fenceLabelOf(text, region.start) });
}

/** The code regions of `text` with their detected `language`. */
export function regionsWithLanguages(text: string, regions?: CodeRegion[]): CodeRegion[] {
  return (regions ?? findCodeLikeRegions(text)).map((region) => ({ ...region, language: detectRegionLanguage(text, region).language }));
}

export function planIdentifierRenames(text: string, options: RenamePlanOptions = {}): RenamePlan {
  const errorRegions = findErrorRegions(text);
  const errorSlots = parseErrorSlots(text, errorRegions);
  const regions = options.regions ?? findCodeLikeRegions(text);
  const bodies = codeBodies(text, regions, errorRegions);
  const guesses = regions.map((region) => detectRegionLanguage(text, region));
  const regionOf = (body: CodeRegion) => regions.findIndex((region) => body.start >= region.start && body.end <= region.end);
  const lexer = new Lexer(text);
  for (const body of bodies) {
    const index = regionOf(body);
    lexer.lex(body.start, body.end, index === -1 ? 'none' : (DOLLAR_INTERPOLATION[guesses[index].language as CodeLanguage] ?? 'none'));
    lexer.tokens.push({ kind: 'newline', start: body.end, end: body.end, text: '\n' });
  }

  // Languages per region, profiles for the whole paste (a profile's signals
  // may sit in another block than the code that needs it).
  const profiles = activeProfiles(bodies.map((body) => text.slice(body.start, body.end)).join('\n'));
  const regionScopes = guesses.map((guess) => new SymbolScope(guess.language, guess.ruledOut, profiles));
  const traceScope = new SymbolScope('unknown', [], profiles);
  const scopes: ScopedRange[] = bodies
    .map((body) => {
      const index = regionOf(body);
      return { start: body.start, end: body.end, scope: index === -1 ? traceScope : regionScopes[index] };
    })
    .sort((a, b) => a.start - b.start);
  // Source lines quoted by error output: their names are renamed like the
  // code's, but they declare nothing.
  const echoLexer = new Lexer(text);
  for (const slot of errorSlots) {
    if (slot.kind !== 'echo' || slot.libraryFrame) continue;
    echoLexer.lex(slot.start, slot.end);
    echoLexer.tokens.push({ kind: 'newline', start: slot.end, end: slot.end, text: '\n' });
  }

  const unrenameable = new Set(regionScopes.flatMap((scope) => [...scope.unrenameableNames()]));
  const analyzer = new Analyzer(lexer.tokens, options.classifications, text, scopes, traceScope, unrenameable);
  analyzer.analyze();

  const roles = new Map<string, IdentifierRole>();
  for (const [name, role] of analyzer.roles) {
    if (!analyzer.excluded(name)) roles.set(name, role);
  }
  const usedNames = new Set(
    [...lexer.tokens, ...echoLexer.tokens].filter((token) => token.kind === 'ident').map((token) => token.text),
  );
  for (const slot of errorSlots) {
    if (slot.kind !== 'echo' && !slot.libraryFrame) usedNames.add(slot.name);
  }
  const knownNames = new Set(options.knownNames ?? []);
  for (const name of knownNames) {
    if (!roles.has(name) && usedNames.has(name) && !analyzer.excluded(name)) roles.set(name, 'variable');
  }
  const undeclared = new Set<string>();
  for (const [name, role] of analyzer.usedNames()) {
    if (roles.has(name)) continue;
    roles.set(name, role);
    undeclared.add(name);
  }
  const ownInTrace = (name: string) =>
    !analyzer.excluded(name) && !isLibraryName(name, traceScope, options.classifications) && !TYPE_KEYWORDS.has(name);
  for (const [name, role] of errorTraceRoles(errorSlots, ownInTrace, new Set([...roles.keys(), ...knownNames]))) {
    if (roles.has(name)) continue;
    roles.set(name, role);
    undeclared.add(name);
  }
  const renamed = new Set(roles.keys());

  const comments = lexer.tokens.filter((token) => token.kind === 'comment');
  const echoComments = echoLexer.tokens.filter((token) => token.kind === 'comment');
  // A file is named after a class or module (`InvoiceService.cs`), not after a variable.
  const frameNames = new Set(
    errorSlots.filter((slot) => slot.kind === 'qualified' && !slot.libraryFrame).map((slot) => slot.name),
  );
  const fileNamed = (name: string) =>
    frameNames.has(name) || ['class', 'namespace', 'function'].includes(roles.get(name) ?? '');
  // Prose around the code: only identifier-shaped names (`offscreenReady_1`),
  // so plain words that happen to be names stay.
  const prose = subtractRegions([{ start: 0, end: text.length }], [...regions, ...errorRegions]).map(
    (region): Token => ({ kind: 'comment', start: region.start, end: region.end, text: text.slice(region.start, region.end) }),
  );
  const slotOccurrences = errorSlots
    .filter((slot) => slot.kind !== 'echo' && !slot.libraryFrame && renamed.has(slot.name))
    .filter((slot) => slot.kind !== 'file-stem' || fileNamed(slot.name))
    .map((slot) => ({ start: slot.start, end: slot.end, name: slot.name }));
  const occurrences = [
    ...analyzer.occurrences(renamed),
    ...commentOccurrences(text, comments, renamed, undeclared),
    ...new Analyzer(echoLexer.tokens).occurrences(renamed),
    ...commentOccurrences(text, echoComments, renamed, undeclared),
    ...commentOccurrences(text, prose, renamed, renamed),
    ...slotOccurrences,
  ].sort(
    (a, b) => a.start - b.start,
  );

  const identifiersInText = new Set<string>();
  for (const match of text.matchAll(/[\p{L}_$][\p{L}\p{N}_$]*/gu)) identifiersInText.add(match[0]);

  return {
    roles,
    occurrences,
    identifiersInText,
    languages: guesses.map((guess) => guess.language),
    profiles: profiles.map((profile) => profile.id),
  };
}

// --- Aliases -----------------------------------------------------------------

const ROLE_WORD: Record<IdentifierRole, string> = {
  class: 'Class',
  function: 'func',
  variable: 'var',
  field: 'field',
  param: 'param',
  constant: 'CONST',
  namespace: 'ns',
};

/** Matches every alias this module can produce. */
export const IDENTIFIER_ALIAS_RE = /^_*(?:Class|[Ff]unc|[Vv]ar|[Ff]ield|[Pp]aram|[Nn]s|CONST|Const|VAR|FUNC|FIELD|PARAM|CLASS|NS)_?(\d+)$/;

/**
 * Alias for `name` in the role it was declared in, keeping its naming
 * convention so the code still reads idiomatically: `alma` → `var1`,
 * `_etags` → `_field2`, `ClientName` → `Field3`, `MAX_SIZE` → `CONST_4`,
 * `load_user` → `func_5`, `Acme` → `Ns6`.
 */
export function aliasFor(name: string, role: IdentifierRole, index: number): string {
  const underscores = /^_*/.exec(name)![0];
  const bare = name.slice(underscores.length);
  const word = ROLE_WORD[role];
  let alias: string;
  if (role === 'class') alias = `Class${index}`;
  else if (isScreamingCase(bare) && bare.length > 1) alias = `${word.toUpperCase()}_${index}`;
  else if (/^[A-Z]/.test(bare)) alias = `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}${index}`;
  else if (bare.includes('_')) alias = `${word.toLowerCase()}_${index}`;
  else alias = `${word.toLowerCase()}${index}`;
  return underscores + alias;
}
