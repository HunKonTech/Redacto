import type { IdentifierRole } from './code-rename';

/**
 * Error output pasted next to (or instead of) code: stack traces, exception
 * lines and compiler diagnostics from Python, Node/JS/TypeScript, .NET,
 * Java/Kotlin, Go and Rust, and tsc/C#/gcc/clang/javac/rustc/go diagnostics.
 *
 * Their prose (`Traceback (most recent call last)`, `has no attribute`) is
 * not code, but the names in them are: the frames name the user's own
 * namespaces, classes and methods, messages quote identifiers, and file
 * names follow class names. This module finds those regions line by line and
 * picks out the name slots, so identifier renaming can give them the aliases
 * the code gets and leave everything else as it is.
 */

export interface ErrorRegion {
  start: number;
  end: number;
}

/**
 * - `qualified`: one segment of a frame's function name or of an exception
 *   type (`Acme` · `Billing` · `InvoiceService` · `LoadInvoice`).
 * - `quoted`: an identifier the output mentions rather than defines — quoted
 *   in a message (`'customerName'`), a .NET parameter, a javac `symbol:`.
 *   Renamed only when the name is renamed anyway.
 * - `file-stem`: the file name without its extension (`InvoiceService.cs`).
 * - `echo`: a source line the output quotes (`    return invoice.total`);
 *   `name` is empty and the slot spans the code.
 */
export type ErrorSlotKind = 'qualified' | 'quoted' | 'file-stem' | 'echo';

export interface ErrorSlot {
  /** UTF-16 index into the analysed text. */
  start: number;
  end: number;
  name: string;
  kind: ErrorSlotKind;
  /** What a `qualified` segment names. */
  role?: IdentifierRole;
  /** The frame is library or runtime code: its names are not the user's. */
  libraryFrame?: boolean;
  /** Shared by the segments of one qualified name. */
  group?: number;
  /** The qualified name is an exception type rather than a frame. */
  exceptionType?: boolean;
}

type Dialect = 'dotnet' | 'java' | 'js' | 'python' | 'go' | 'rust' | 'exception';

type LineKind =
  | 'header'
  | 'frame'
  | 'location'
  | 'diagnostic'
  | 'code-frame'
  | 'continuation'
  | 'marker'
  | 'gutter'
  | 'echo'
  | 'message'
  | 'exception'
  | 'rust-panic'
  | 'rust-entry'
  | 'go-func';

interface Line {
  start: number;
  end: number;
  text: string;
}

interface LineInfo {
  kind: LineKind;
  /** A line that is error output on its own; a region needs one. */
  strong: boolean;
  slots: ErrorSlot[];
  /** The line is a frame in library code. */
  library?: boolean;
  /** The next line, when indented, quotes the frame's source (Python). */
  echoNext?: boolean;
  /** Library-ness is decided by the next line's location (Go, Rust backtraces). */
  locatedByNext?: boolean;
  /** Set on a location line that points into library code. */
  libraryLocation?: boolean;
}

// --- Line patterns -------------------------------------------------------------

const PY_TRACEBACK_RE = /^\s*Traceback \(most recent call last\):\s*$/;
const PY_FRAME_RE = /^\s*File "(?<path>[^"]+)", line \d+(?:, in (?<name>\S.*?))?\s*$/d;
const PY_CHAIN_RE =
  /^\s*(?:During handling of the above exception, another exception occurred:|The above exception was the direct cause of the following exception:)\s*$/;

/** `    at InvoiceService.loadInvoice (/app/src/invoice.ts:42:13)` */
const NODE_FRAME_RE =
  /^\s+at (?:async )?(?<ctor>new )?(?<name>[^\s()][^()]*?)(?: \[as [^\]]+\])? \((?<loc>[^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/d;
const NODE_LOCATION_RE = /^(?:.*:\d+(?::\d+)?|<anonymous>|native|index \d+|unknown location)$/;
/** `    at /app/src/index.js:5:3` (Node), `      at ./src/main.rs:5:10` (Rust). */
const BARE_LOCATION_RE = /^\s+at (?:async )?(?<path>\S(?:.*\S)?):\d+:\d+\s*$/d;
/** `/app/src/invoice.js:12` above the offending line and its `^` marker (Node). */
const NODE_CODE_FRAME_RE = /^(?<path>(?:file:\/\/)?[^\s:]*[\\/][^\s:]*\.(?:[cm]?[jt]s|jsx|tsx)):\d+\s*$/d;
const NODE_VERSION_RE = /^Node\.js v\d+/;

/** `   at Acme.Billing.InvoiceService.LoadInvoice(Int32 id) in C:\src\InvoiceService.cs:line 42` and Java's `\tat com.acme.Foo.bar(Foo.java:42)`. */
const PAREN_FRAME_RE =
  /^\s+at (?<name>[^\s(]+)\((?<params>[^()]*(?:\([^()]*\)[^()]*)*)\)(?: in (?<path>.+?):line \d+)?(?:\s+~?\[[^\]]*\])?\s*$/d;
/** Mono: `  at Acme.Foo.Bar (System.Int32 id) [0x00012] in /src/Foo.cs:12` */
const MONO_FRAME_RE =
  /^\s+at (?<name>[^\s(]+) \((?<params>[^()]*)\)(?: (?:\[0x[0-9a-f]+\]|<0x[0-9a-f]+(?: \+ 0x[0-9a-f]+)?>) in (?<path>.+?):\d+)\s*$/d;
const JAVA_LOCATION_RE = /^(?:[\w$.-]+\.[A-Za-z]\w*(?::\d+)?|Native Method|Unknown Source|Compiled Code|Native|Unknown)$/;
/** `java.base/`, `app//`, `java.base@17.0.2/` before a Java frame's class. */
const JAVA_MODULE_RE = /^(?:[\w.-]+@[\w.-]+\/|[\w.-]*\/\/?)(?=[\w$]+\.)/;
const MORE_FRAMES_RE = /^\s*\.\.\. \d+ (?:more|common frames omitted)\s*$/;
const DOTNET_END_RE = /^\s*--- End of .*---\s*$/;

const EXCEPTION_PREFIX_RE =
  /^(?:\s*)(?:Unhandled [Ee]xception[.:] |Uncaught (?:\(in promise\) )?|Exception in thread "[^"]*" |Caused by: |Suppressed: |\s*---> |\[cause\]: )+/;
const EXCEPTION_RE = /^(?<type>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?::(?<msg>\s.*|\s*))?$/d;
const EXCEPTION_TYPE_RE = /(?:^|[.$])(?:[A-Z][\w$]*)?(?:Error|Exception|Exit|Interrupt|Throwable|Panic|Fault)$/;

const GO_PANIC_RE = /^(?:panic|fatal error): (?<msg>.*)$/d;
const GO_GOROUTINE_RE = /^goroutine \d+ \[[^\]]*\]:\s*$/;
const GO_FUNC_RE = /^(?<name>[^\s(][^\s]*?)\((?<args>[^()]*)\)\s*$/d;
const GO_LOCATION_RE = /^\t(?<path>\S.*?\.go):\d+(?: \+0x[0-9a-f]+)?\s*$/d;
const GO_CREATED_RE = /^created by (?<name>\S+?)(?: in goroutine \d+)?\s*$/d;
const GO_SIGNAL_RE = /^\[signal .*\]\s*$/;

const RUST_PANIC_RE = /^thread '[^']*' panicked at (?:'.*', )?(?<path>[^\s:][^:]*?):\d+:\d+:?\s*$/d;
const RUST_BACKTRACE_RE = /^stack backtrace:\s*$/;
const RUST_ENTRY_RE = /^\s+\d+:\s+(?:0x[0-9a-f]+ - )?(?<name>\S(?:.*\S)?)\s*$/d;
const RUST_NOTE_RE = /^note: (?:run with `RUST_BACKTRACE|Some details are omitted)/;

/** `src/invoice.ts(12,5): error TS2339: …`, `C:\src\Foo.cs(42,17): error CS0103: … [C:\src\Foo.csproj]` */
const PAREN_DIAGNOSTIC_RE =
  /^(?<path>[^\s(][^(]*?)\(\d+,\d+(?:,\d+,\d+)?\): (?:fatal )?(?:error|warning) [A-Z]+\d+: (?<msg>.*)$/d;
/** tsc --pretty: `src/invoice.ts:12:5 - error TS2339: …` */
const DASH_DIAGNOSTIC_RE = /^(?<path>[^\s:]\S*?):\d+:\d+ - (?:error|warning) [A-Z]+\d+: (?<msg>.*)$/d;
/** gcc/clang/javac/rustc-short: `main.c:12:5: error: …`; `InvoiceService.java:42: error: …` */
const COLON_DIAGNOSTIC_RE =
  /^(?<path>(?:[A-Za-z]:[\\/])?[^\s:]*\.\w+):\d+(?::\d+)?: (?:fatal )?(?:error|warning)(?:\[[\w-]+\])?: (?<msg>.*)$/d;
/** go build / go vet: `./main.go:12:5: undefined: customerName` */
const GO_DIAGNOSTIC_RE = /^(?<path>[^\s:]*\.go):\d+:\d+: (?<msg>.*)$/d;
/** kotlinc: `e: file:///src/Main.kt:5:13 Unresolved reference: customerName` */
const KOTLIN_DIAGNOSTIC_RE = /^[ew]: (?:file:\/\/)?(?<path>\S+?\.kts?)(?::\d+:\d+|: \(\d+, \d+\):) (?<msg>.*)$/d;
const RUSTC_HEADER_RE = /^(?:error|warning)\[[A-Z]\d+\]: (?<msg>.*)$/d;
const RUSTC_PLAIN_RE = /^(?:error|warning): (?<msg>.*)$/d;
const RUSTC_LOCATION_RE = /^\s*--> (?<path>.+?):\d+:\d+\s*$/d;
/** `   |`, `   |     ^^^ help: …` (no line number: a marker or note line). */
const GUTTER_RE = /^\s*\|(?<rest>.*)$/d;
/** `5  |     let x = customer_name;` (rustc, gcc) or tsc --pretty's `12     const x = …`. */
const NUMBERED_ECHO_RE = /^\s*\d+(?:\s*\|| {2})\s*(?<code>.*)$/d;
const RUSTC_NOTE_RE = /^\s*= (?:note|help): (?<msg>.*)$/d;
const JAVAC_DETAIL_RE = /^\s+(?:symbol|location):\s+(?<msg>.*)$/d;
const REPEATED_RE = /^\s*\[Previous line repeated \d+ more times?\]\s*$/;
const MARKER_RE = /^\s*[\^~]+[\^~\s-]*$/;

/** A quoted identifier or dotted name, optionally with `()`: `'customerName'`, `` `load_invoice()` ``. */
const QUOTED_RE =
  /(?<open>['"`‘“])(?<name>[\p{L}_$][\p{L}\p{N}_$]*(?:(?:\.|::)[\p{L}_$][\p{L}\p{N}_$]*)*)(?:\(\))?(?<close>['"`’”])/gdu;
const QUOTE_PAIRS: Record<string, string> = { "'": "'", '"': '"', '`': '`', '‘': '’', '“': '”' };
/** Unquoted mentions: Go's `undefined: x`, Kotlin's `Unresolved reference: x`, javac's `symbol: variable x`. */
const MENTION_RES = [
  /\bundefined: (?<name>[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)?)/du,
  /\bUnresolved reference:? (?<name>[\p{L}_][\p{L}\p{N}_]*)/du,
  /^(?:variable|method|class|interface|enum|record|field|constructor) (?<name>[\p{L}_$][\p{L}\p{N}_$]*)/du,
  /^(?:variable [\p{L}_$][\p{L}\p{N}_$]* of type|class|interface|enum|record) (?<name>[\p{L}_$][\p{L}\p{N}_$.]*)/du,
];
const WORD_RE = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
/** Longer lines (minified code, data) are never error output; this also bounds regex work. */
const MAX_LINE_LENGTH = 2000;

// --- Library frames ------------------------------------------------------------

const LIBRARY_PATH_RE = new RegExp(
  [
    String.raw`node_modules[\\/]`,
    String.raw`(?:site|dist)-packages[\\/]`,
    String.raw`[\\/]lib[\\/]python\d`,
    String.raw`[\\/]Python\d*[\\/]Lib[\\/]`,
    String.raw`<frozen `,
    String.raw`^node:`,
    String.raw`^internal[\\/]`,
    String.raw`^<anonymous>$`,
    String.raw`^native$`,
    String.raw`^index \d+$`,
    String.raw`^unknown location$`,
    String.raw`[\\/]go[\\/]pkg[\\/]mod[\\/]`,
    String.raw`GOROOT`,
    String.raw`[\\/](?:usr[\\/](?:local[\\/])?|opt[\\/]homebrew[\\/]|Program Files[\\/])(?:lib[\\/])?go(?:lang)?[\\/]`,
    String.raw`[\\/]rustc[\\/][0-9a-f]{7,}`,
    String.raw`\.cargo[\\/]registry`,
    String.raw`\.rustup[\\/]`,
    String.raw`^\/_\/src\/`,
  ].join('|'),
);

const LIBRARY_NAME_PREFIXES = [
  // .NET
  'System.', 'Microsoft.', 'Newtonsoft.', 'NUnit.', 'Xunit.', 'Castle.', 'Npgsql.', 'Dapper.', 'Polly.',
  'Serilog.', 'AutoMapper.', 'MediatR.', 'StackExchange.', 'Grpc.', 'Azure.', 'Amazon.', 'Google.', 'Moq.',
  'FluentValidation.',
  // Java / Kotlin / JVM
  'java.', 'javax.', 'jakarta.', 'jdk.', 'sun.', 'com.sun.', 'kotlin.', 'kotlinx.', 'android.', 'androidx.',
  'dalvik.', 'org.junit.', 'junit.', 'org.springframework.', 'org.apache.', 'org.hibernate.', 'com.fasterxml.',
  'com.google.', 'io.netty.', 'reactor.', 'org.slf4j.', 'ch.qos.', 'okhttp3.', 'retrofit2.', 'org.gradle.',
  'org.eclipse.', 'org.mockito.', 'org.testng.', 'io.micronaut.', 'io.quarkus.', 'io.ktor.', 'scala.', 'akka.',
  'groovy.', 'org.codehaus.',
  // Rust
  'std::', 'core::', 'alloc::', 'tokio::', 'futures::', 'hyper::', 'axum::', 'tower::', 'serde::',
  'backtrace::', 'rust_begin_unwind', '__rust', 'test::',
  // Go
  'runtime.',
];

/** JVM-generated classes: lambdas, proxies, reflection accessors. */
const GENERATED_FRAME_RE = /\$\$Lambda|\$Proxy\d|CGLIB\$\$|\$\$EnhancerBy|\$\$FastClass|Generated(?:Method|Constructor)Accessor/;

/** First element of a Go standard-library import path. */
const GO_STD_PACKAGES = new Set(
  (
    'runtime net sync reflect testing encoding io os fmt database internal syscall context strings strconv ' +
    'time bufio crypto math sort errors log path regexp text html mime compress archive unicode bytes ' +
    'container hash flag embed debug go plugin expvar image slices maps iter cmp unsafe'
  ).split(' '),
);

function isGoStdlib(name: string): boolean {
  const lastSlash = name.lastIndexOf('/');
  const dot = name.indexOf('.', lastSlash + 1);
  const pkg = dot === -1 ? name : name.slice(0, dot);
  const first = pkg.split('/')[0];
  return !first.includes('.') && GO_STD_PACKAGES.has(first);
}

function hasLibraryPrefix(name: string): boolean {
  return LIBRARY_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isLibraryFrame(name: string, path: string | undefined, dialect: Dialect): boolean {
  if (path !== undefined && LIBRARY_PATH_RE.test(path)) return true;
  const bare = name.replace(/^<+/, '');
  if (hasLibraryPrefix(bare) || GENERATED_FRAME_RE.test(name)) return true;
  return dialect === 'go' && isGoStdlib(name);
}

// --- Qualified names -----------------------------------------------------------

/** Compiler-, runtime- or format-made segments that name nothing of the user's. */
const SKIPPED_SEGMENTS = new Set(
  (
    'anonymous module lambda listcomp dictcomp setcomp genexpr closure computed MoveNext Companion ' +
    'DefaultImpls WhenMappings Lambda access invoke invokeSuspend eval as'
  ).split(' '),
);
const CONSTRUCTOR_SEGMENTS = new Set(['ctor', 'cctor', 'init', 'clinit']);
/** Top-level domains that open Java package names (`com.acme.billing`). */
const TLD_SEGMENTS = new Set('com org net io de hu uk co eu at ch fr nl dev app edu gov'.split(' '));
const SKIPPED_SEGMENT_RE = /^(?:[a-z]__|func\d+$|h[0-9a-f]{16}$|v\d+$|_+$)/;

interface Run {
  name: string;
  start: number;
  end: number;
  angle: number;
  square: number;
  curly: number;
  paren: number;
  /** `.NET` compiler-generated wrapper around the real method: `<LoadAsync>d__4`. */
  generated: boolean;
  /** Joined to its neighbour by a nesting separator (`Outer+Inner`). */
  nested: boolean;
}

interface QualifiedOptions {
  exception?: boolean;
  ctor?: boolean;
  library: boolean;
  group: number;
}

/**
 * Split a frame's function name (or an exception type) into its segments
 * and give each a role: the last is the function (the class, for an
 * exception or a constructor), the one before it a class when capitalized,
 * the rest namespaces. Java and Rust spell classes capitalized and packages
 * lowercase, so there the case decides.
 */
function qualifiedSlots(qualified: string, offset: number, dialect: Dialect, options: QualifiedOptions): ErrorSlot[] {
  const runRe = dialect === 'java' ? /[\p{L}_][\p{L}\p{N}_]*/gu : /[\p{L}_$][\p{L}\p{N}_$]*/gu;
  let runs: Run[] = [];
  const depth = { angle: 0, square: 0, curly: 0, paren: 0 };
  let cursor = 0;
  const advance = (to: number) => {
    for (; cursor < to; cursor += 1) {
      const ch = qualified[cursor];
      if (ch === '<') depth.angle += 1;
      else if (ch === '>' && qualified[cursor - 1] !== '-') depth.angle = Math.max(0, depth.angle - 1);
      else if (ch === '[') depth.square += 1;
      else if (ch === ']') depth.square = Math.max(0, depth.square - 1);
      else if (ch === '{') depth.curly += 1;
      else if (ch === '}') depth.curly = Math.max(0, depth.curly - 1);
      else if (ch === '(') depth.paren += 1;
      else if (ch === ')') depth.paren = Math.max(0, depth.paren - 1);
    }
  };

  // Go module paths open with a domain (`github.com/acme/billing`).
  const firstSlash = qualified.indexOf('/');
  const domainEnd = dialect === 'go' && firstSlash !== -1 && qualified.slice(0, firstSlash).includes('.') ? firstSlash : 0;
  // Rust names can hold several paths (`<billing::Invoice as core::fmt::Display>::fmt`).
  const libraryPaths: { start: number; end: number }[] = [];
  if (dialect === 'rust') {
    for (const path of qualified.matchAll(/[\p{L}_][\p{L}\p{N}_]*(?:::[\p{L}_][\p{L}\p{N}_]*)*/gu)) {
      if (hasLibraryPrefix(`${path[0]}::`) || hasLibraryPrefix(path[0])) {
        libraryPaths.push({ start: path.index ?? 0, end: (path.index ?? 0) + path[0].length });
      }
    }
  }

  for (const match of qualified.matchAll(runRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    advance(start);
    if (start < domainEnd) continue;
    if (libraryPaths.some((path) => start >= path.start && end <= path.end)) continue;
    const before = qualified[start - 1];
    const after = qualified[end];
    runs.push({
      name: match[0],
      start,
      end,
      ...depth,
      generated: before === '<' && after === '>' && /^[a-z]__/.test(qualified.slice(end + 1)),
      nested: before === '+' || after === '+',
    });
    advance(end);
  }

  // `<LoadAsync>d__4.MoveNext`: the method is the wrapped name.
  const generatedIndex = runs.findIndex((run) => run.generated);
  if (generatedIndex !== -1) runs = runs.slice(0, generatedIndex + 1);
  let ctor = options.ctor ?? false;
  const last = runs[runs.length - 1];
  if (last && !last.generated && CONSTRUCTOR_SEGMENTS.has(last.name)) {
    runs.pop();
    ctor = true;
  }

  const kept = runs.filter((run, index) => {
    if (run.generated) return true;
    if (run.square > 0 || run.curly > 0 || (run.angle > 0 && dialect !== 'rust')) return false;
    if (SKIPPED_SEGMENTS.has(run.name) || CONSTRUCTOR_SEGMENTS.has(run.name)) return false;
    if (run.name.length === 1 || SKIPPED_SEGMENT_RE.test(run.name)) return false;
    return !(index === 0 && (dialect === 'java' || dialect === 'exception') && TLD_SEGMENTS.has(run.name));
  });

  return kept.map((run, index) => {
    const capitalized = /^[_$]*[A-Z]/.test(run.name);
    let role: IdentifierRole;
    if (index === kept.length - 1) role = options.exception || ctor ? 'class' : 'function';
    else if (dialect === 'go' && run.paren > 0) role = 'class';
    else if (dialect === 'java' || dialect === 'rust') role = capitalized ? 'class' : 'namespace';
    else if (run.nested) role = 'class';
    else if (index === kept.length - 2 && capitalized && !options.exception) role = 'class';
    else role = 'namespace';
    return {
      start: offset + run.start,
      end: offset + run.end,
      name: run.name,
      kind: 'qualified' as const,
      role,
      libraryFrame: options.library,
      group: options.group,
      ...(options.exception ? { exceptionType: true } : {}),
    };
  });
}

/** The file name's stem: `C:\src\InvoiceService.cs` → `InvoiceService`. */
function fileStemSlot(path: string, offset: number, library: boolean): ErrorSlot[] {
  const nameStart = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1;
  const match = /^[\p{L}_$][\p{L}\p{N}_$]*(?=\.)/u.exec(path.slice(nameStart));
  if (!match) return [];
  const start = offset + nameStart;
  return [{ start, end: start + match[0].length, name: match[0], kind: 'file-stem', libraryFrame: library }];
}

/** Identifiers a message quotes or names. */
function messageSlots(message: string, offset: number): ErrorSlot[] {
  const slots: ErrorSlot[] = [];
  const addWords = (text: string, at: number) => {
    for (const word of text.matchAll(WORD_RE)) {
      const start = at + (word.index ?? 0);
      if (slots.some((slot) => slot.start === start)) continue;
      slots.push({ start, end: start + word[0].length, name: word[0], kind: 'quoted' });
    }
  };
  for (const match of message.matchAll(QUOTED_RE)) {
    const groups = match.groups!;
    if (QUOTE_PAIRS[groups.open] !== groups.close) continue;
    addWords(groups.name, offset + match.indices!.groups!.name[0]);
  }
  for (const re of MENTION_RES) {
    const match = re.exec(message);
    if (match) addWords(match.groups!.name, offset + match.indices!.groups!.name[0]);
  }
  return slots.sort((a, b) => a.start - b.start);
}

/** Every identifier in a .NET parameter list (`Int32 id, Invoice invoice`), as mentions. */
function paramSlots(params: string, offset: number, library: boolean): ErrorSlot[] {
  if (library) return [];
  return [...params.matchAll(WORD_RE)].map((word) => {
    const start = offset + (word.index ?? 0);
    return { start, end: start + word[0].length, name: word[0], kind: 'quoted' as const };
  });
}

// --- Line classification -------------------------------------------------------

type Groups = Record<string, [number, number] | undefined>;

/** Absolute offset of a named group of a `d`-flagged match. */
function at(line: Line, match: RegExpExecArray, group: string): number {
  return line.start + (match.indices!.groups as Groups)[group]![0];
}

class Classifier {
  private group = 0;

  private nextGroup(): number {
    this.group += 1;
    return this.group;
  }

  /** Lines that are error output whatever surrounds them. */
  independent(line: Line): LineInfo | null {
    const text = line.text;
    if (text.trim() === '' || text.length > MAX_LINE_LENGTH) return null;

    if (PY_TRACEBACK_RE.test(text) || RUST_BACKTRACE_RE.test(text) || GO_GOROUTINE_RE.test(text)) {
      return { kind: 'header', strong: true, slots: [] };
    }

    let match = PY_FRAME_RE.exec(text);
    if (match) {
      const path = match.groups!.path;
      const name = match.groups!.name;
      const library = isLibraryFrame(name ?? '', path, 'python');
      const slots = fileStemSlot(path, at(line, match, 'path'), library);
      if (name) slots.push(...qualifiedSlots(name, at(line, match, 'name'), 'python', { library, group: this.nextGroup() }));
      return { kind: 'frame', strong: true, slots, library, echoNext: true };
    }

    match = PAREN_FRAME_RE.exec(text) ?? MONO_FRAME_RE.exec(text);
    if (match) {
      const { params, path } = match.groups!;
      const java = path === undefined && JAVA_LOCATION_RE.test(params.trim());
      let name = match.groups!.name;
      let nameAt = at(line, match, 'name');
      if (java) {
        const module = JAVA_MODULE_RE.exec(name);
        if (module) {
          name = name.slice(module[0].length);
          nameAt += module[0].length;
        }
        const library = isLibraryFrame(name, undefined, 'java');
        return {
          kind: 'frame',
          strong: true,
          slots: [
            ...qualifiedSlots(name, nameAt, 'java', { library, group: this.nextGroup() }),
            ...fileStemSlot(params, at(line, match, 'params'), library),
          ],
        };
      }
      const library = isLibraryFrame(name, path, 'dotnet');
      const slots = [
        ...qualifiedSlots(name, nameAt, 'dotnet', { library, group: this.nextGroup() }),
        ...paramSlots(params, at(line, match, 'params'), library),
      ];
      if (path !== undefined) slots.push(...fileStemSlot(path, at(line, match, 'path'), library));
      return { kind: 'frame', strong: true, slots };
    }

    match = NODE_FRAME_RE.exec(text);
    if (match && NODE_LOCATION_RE.test(match.groups!.loc)) {
      const { name, loc } = match.groups!;
      const path = loc.replace(/:\d+(?::\d+)?$/, '');
      const library = isLibraryFrame(name, path, 'js');
      return {
        kind: 'frame',
        strong: true,
        slots: [
          ...qualifiedSlots(name, at(line, match, 'name'), 'js', {
            library,
            ctor: match.groups!.ctor !== undefined,
            group: this.nextGroup(),
          }),
          ...fileStemSlot(path, at(line, match, 'loc'), library),
        ],
      };
    }

    match = BARE_LOCATION_RE.exec(text) ?? GO_LOCATION_RE.exec(text);
    if (match) {
      const path = match.groups!.path;
      const library = LIBRARY_PATH_RE.test(path);
      return {
        kind: 'location',
        strong: true,
        slots: fileStemSlot(path, at(line, match, 'path'), library),
        libraryLocation: library,
      };
    }

    match = RUST_PANIC_RE.exec(text);
    if (match) {
      const path = match.groups!.path;
      const pathAt = at(line, match, 'path');
      return {
        kind: 'rust-panic',
        strong: true,
        // The thread name and (before Rust 1.73) the message are quoted before the path.
        slots: [
          ...messageSlots(text.slice(0, pathAt - line.start), line.start),
          ...fileStemSlot(path, pathAt, LIBRARY_PATH_RE.test(path)),
        ],
      };
    }

    for (const re of [PAREN_DIAGNOSTIC_RE, DASH_DIAGNOSTIC_RE, COLON_DIAGNOSTIC_RE, GO_DIAGNOSTIC_RE, KOTLIN_DIAGNOSTIC_RE]) {
      match = re.exec(text);
      if (!match) continue;
      const path = match.groups!.path;
      return {
        kind: 'diagnostic',
        strong: true,
        slots: [
          ...fileStemSlot(path, at(line, match, 'path'), LIBRARY_PATH_RE.test(path)),
          ...messageSlots(match.groups!.msg, at(line, match, 'msg')),
        ],
      };
    }

    match = RUSTC_HEADER_RE.exec(text) ?? GO_PANIC_RE.exec(text);
    if (match) return { kind: 'header', strong: true, slots: messageSlots(match.groups!.msg, at(line, match, 'msg')) };

    match = RUSTC_LOCATION_RE.exec(text);
    if (match) {
      const path = match.groups!.path;
      return { kind: 'location', strong: true, slots: fileStemSlot(path, at(line, match, 'path'), LIBRARY_PATH_RE.test(path)) };
    }

    match = NODE_CODE_FRAME_RE.exec(text);
    if (match) {
      const path = match.groups!.path;
      const library = LIBRARY_PATH_RE.test(path);
      const slots = fileStemSlot(path, at(line, match, 'path'), library);
      return { kind: 'code-frame', strong: true, slots, library, echoNext: true };
    }

    return this.exception(line, false);
  }

  /**
   * An exception line: `System.NullReferenceException: …`, `Caused by: …`,
   * `KeyError: 'customer_name'`. Without a prefix or an exception-shaped
   * type (`InvoiceNotFound: INV-1`) it only counts next to frames (`weak`).
   */
  exception(line: Line, weak: boolean): LineInfo | null {
    const prefix = EXCEPTION_PREFIX_RE.exec(line.text)?.[0] ?? '';
    if (!prefix && /^\s/.test(line.text)) return null;
    const body = line.text.slice(prefix.length);
    const match = EXCEPTION_RE.exec(body);
    if (!match) return null;
    const type = match.groups!.type;
    const message = match.groups!.msg;
    const strong = prefix !== '' || EXCEPTION_TYPE_RE.test(type);
    if (!strong && !(weak && (type.includes('.') || (message ?? '').trim() !== ''))) return null;
    const bodyStart = line.start + prefix.length;
    const typeAt = bodyStart + match.indices!.groups!.type[0];
    const library = isLibraryFrame(type, undefined, 'exception');
    const slots = qualifiedSlots(type, typeAt, 'exception', { exception: true, library, group: this.nextGroup() });
    // A `KeyError` quotes a dictionary key, which is data, not a name.
    if (message !== undefined && !/(?:^|\.)KeyError$/.test(type)) {
      slots.push(...messageSlots(message, bodyStart + match.indices!.groups!.msg[0]));
    }
    return { kind: 'exception', strong, slots };
  }

  /** Lines that only count inside error output, given the lines around them. */
  contextual(line: Line, prev: LineInfo | null, prevAdjacent: boolean, next: LineInfo | null, nextLine?: Line): LineInfo | null {
    const text = line.text;
    if (text.trim() === '' || text.length > MAX_LINE_LENGTH) return null;

    // Go: a function line is followed by its location.
    const goLocationNext = next?.kind === 'location' && GO_LOCATION_RE.test(nextLine?.text ?? '');
    let match = goLocationNext ? GO_FUNC_RE.exec(text) : null;
    if (match && match.groups!.name.includes('.')) {
      const name = match.groups!.name;
      const library = isLibraryFrame(name, undefined, 'go');
      return {
        kind: 'go-func',
        strong: false,
        slots: qualifiedSlots(name, at(line, match, 'name'), 'go', { library, group: this.nextGroup() }),
        locatedByNext: !library,
      };
    }

    // The source line after a frame or a diagnostic.
    if (prev && prevAdjacent) {
      const indented = /^\s+\S/.test(text);
      const markerNext = nextLine !== undefined && MARKER_RE.test(nextLine.text);
      if ((prev.echoNext && (indented || prev.kind === 'code-frame')) || (prev.kind === 'diagnostic' && indented && markerNext)) {
        const codeStart = line.start + (text.length - text.trimStart().length);
        return {
          kind: 'echo',
          strong: false,
          slots: [{ start: codeStart, end: line.end, name: '', kind: 'echo', libraryFrame: prev.library ?? false }],
        };
      }
      if (prev.kind === 'rust-panic') {
        return { kind: 'message', strong: false, slots: messageSlots(text, line.start) };
      }
    }

    if (prev === null) {
      // A header naming its exception right above the first frame.
      return next && (next.kind === 'frame' || next.kind === 'location') ? this.exception(line, true) : null;
    }

    if (MARKER_RE.test(text)) return { kind: 'marker', strong: false, slots: [] };
    match = NUMBERED_ECHO_RE.exec(text);
    if (match && (prev.kind === 'gutter' || prev.kind === 'location' || prev.kind === 'diagnostic' || prev.kind === 'echo')) {
      const codeStart = at(line, match, 'code');
      if (codeStart === line.end) return { kind: 'gutter', strong: false, slots: [] };
      return { kind: 'echo', strong: false, slots: [{ start: codeStart, end: line.end, name: '', kind: 'echo' }] };
    }
    match = GUTTER_RE.exec(text);
    if (match) return { kind: 'gutter', strong: false, slots: messageSlots(match.groups!.rest, at(line, match, 'rest')) };
    match = RUSTC_NOTE_RE.exec(text) ?? JAVAC_DETAIL_RE.exec(text) ?? RUSTC_PLAIN_RE.exec(text);
    if (match) return { kind: 'continuation', strong: false, slots: messageSlots(match.groups!.msg, at(line, match, 'msg')) };
    match = GO_CREATED_RE.exec(text);
    if (match) {
      const name = match.groups!.name;
      const library = isLibraryFrame(name, undefined, 'go');
      return {
        kind: 'go-func',
        strong: false,
        slots: qualifiedSlots(name, at(line, match, 'name'), 'go', { library, group: this.nextGroup() }),
        locatedByNext: !library,
      };
    }
    match = RUST_ENTRY_RE.exec(text);
    if (match && (prev.kind === 'header' || prev.kind === 'rust-entry' || prev.kind === 'location')) {
      const name = match.groups!.name;
      const library = isLibraryFrame(name, undefined, 'rust');
      return {
        kind: 'rust-entry',
        strong: false,
        slots: qualifiedSlots(name, at(line, match, 'name'), 'rust', { library, group: this.nextGroup() }),
        locatedByNext: !library,
      };
    }
    if (
      PY_CHAIN_RE.test(text) ||
      MORE_FRAMES_RE.test(text) ||
      DOTNET_END_RE.test(text) ||
      REPEATED_RE.test(text) ||
      RUST_NOTE_RE.test(text) ||
      GO_SIGNAL_RE.test(text) ||
      NODE_VERSION_RE.test(text)
    ) {
      return { kind: 'continuation', strong: false, slots: [] };
    }
    // The exception line closing a Python traceback: `InvoiceNotFound: INV-1`.
    if (['frame', 'echo', 'marker', 'location'].includes(prev.kind) || (next && next.kind === 'frame')) {
      return this.exception(line, true);
    }
    return null;
  }
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  for (const raw of text.split('\n')) {
    const body = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    lines.push({ start: offset, end: offset + body.length, text: body });
    offset += raw.length + 1;
  }
  return lines;
}

/** Cheap test for anything a line pattern could match, to skip plain prose and code. */
const ERROR_HINT_RE =
  /Traceback|File "|^\s+at |Error\b|Exception|Exit\b|Interrupt\b|Throwable|Panic|Fault|panic|goroutine|stack backtrace|Caused by|Suppressed:|--->|\[cause\]|\.go:\d|: (?:fatal )?(?:error|warning)\b|\b(?:error|warning)(?:\[| [A-Z]+\d+:)|-->|^[ew]: |\.[cm]?[jt]sx?:\d+\s*$/m;

interface ScannedLine extends Line {
  info: LineInfo | null;
}

/** Classify every line of `text`; `null` for lines that are not error output. */
function scan(text: string): ScannedLine[] {
  const lines = splitLines(text);
  if (!ERROR_HINT_RE.test(text)) return lines.map((line) => ({ ...line, info: null }));
  const classifier = new Classifier();
  const infos = lines.map((line) => classifier.independent(line));

  // Contextual lines, top to bottom so each sees its finished predecessor.
  let prevIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (infos[i] === null && lines[i].text.trim() !== '') {
      const prev = prevIndex === -1 ? null : infos[prevIndex];
      let nextIndex = i + 1;
      while (nextIndex < lines.length && lines[nextIndex].text.trim() === '') nextIndex += 1;
      infos[i] = classifier.contextual(lines[i], prev, prevIndex === i - 1, infos[nextIndex] ?? null, lines[i + 1]);
    }
    if (lines[i].text.trim() !== '') prevIndex = infos[i] ? i : -1;
  }

  // Go and Rust backtrace entries are library code when their location is.
  for (let i = 0; i < lines.length; i += 1) {
    const info = infos[i];
    if (!info?.locatedByNext || !infos[i + 1]?.libraryLocation) continue;
    for (const slot of info.slots) slot.libraryFrame = true;
  }
  return lines.map((line, i) => ({ ...line, info: infos[i] }));
}

/**
 * Runs of error-output lines holding at least one line that is error output
 * on its own (a header, a frame, a diagnostic). Blank lines inside a run
 * (Python's chained tracebacks) do not break it. Regions are whole lines.
 */
function regionsOf(lines: readonly ScannedLine[]): ErrorRegion[] {
  const regions: ErrorRegion[] = [];
  let first = -1;
  let last = -1;
  let strong = false;
  const close = () => {
    if (first !== -1 && strong) regions.push({ start: lines[first].start, end: lines[last].end });
    first = -1;
    strong = false;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const { info } = lines[i];
    if (info) {
      if (first === -1) first = i;
      last = i;
      strong ||= info.strong;
    } else if (lines[i].text.trim() !== '') {
      close();
    }
  }
  close();
  return regions;
}

/** Stack traces, exception lines and compiler diagnostics in `text`. */
export function findErrorRegions(text: string): ErrorRegion[] {
  return regionsOf(scan(text));
}

/** The name slots and quoted source lines inside `regions`, in text order. */
export function parseErrorSlots(text: string, regions: readonly ErrorRegion[]): ErrorSlot[] {
  if (regions.length === 0) return [];
  const slots: ErrorSlot[] = [];
  for (const line of scan(text)) {
    if (!line.info || !regions.some((region) => line.start >= region.start && line.end <= region.end)) continue;
    slots.push(...line.info.slots);
  }
  return slots.sort((a, b) => a.start - b.start);
}

/** `regions` with every part inside `holes` cut out. */
export function subtractRegions(regions: readonly ErrorRegion[], holes: readonly ErrorRegion[]): ErrorRegion[] {
  const sortedHoles = [...holes].sort((a, b) => a.start - b.start);
  const out: ErrorRegion[] = [];
  for (const region of regions) {
    let start = region.start;
    for (const hole of sortedHoles) {
      if (hole.end <= start || hole.start >= region.end) continue;
      if (hole.start > start) out.push({ start, end: hole.start });
      start = Math.max(start, hole.end);
    }
    if (start < region.end) out.push({ start, end: region.end });
  }
  return out;
}

/**
 * The frames and exception types of each region as code
 * (`Acme.Billing.InvoiceService.LoadInvoice()`), plus the source lines the
 * output quotes, for the identifier classifier: it reads names in context.
 */
export function errorRegionCodeTexts(text: string, regions: readonly ErrorRegion[]): string[] {
  const slots = parseErrorSlots(text, regions);
  return regions
    .map((region) => {
      const entries: (string | ErrorSlot[])[] = [];
      const groups = new Map<number, ErrorSlot[]>();
      for (const slot of slots) {
        if (slot.start < region.start || slot.end > region.end) continue;
        if (slot.kind === 'echo') {
          entries.push(text.slice(slot.start, slot.end));
        } else if (slot.group !== undefined) {
          const group = groups.get(slot.group);
          if (group) {
            group.push(slot);
          } else {
            groups.set(slot.group, [slot]);
            entries.push(groups.get(slot.group)!);
          }
        }
      }
      return entries
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          const name = entry.map((slot) => slot.name).join('.');
          return entry[0].exceptionType ? `throw new ${name}();` : `${name}();`;
        })
        .join('\n');
    })
    .filter((body) => body.trim().length > 0);
}
