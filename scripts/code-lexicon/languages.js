/**
 * Language lexicons: each language's built-in and standard-library names,
 * generated from a machine-readable source. Every builder lists the remote
 * sources it `needs` (see sources.js); the others read `node_modules`.
 *
 * The rules below choose *which* names count (namespaces, types whose
 * members are recognised on any receiver); the names themselves always come
 * from the source.
 */

const fs = require('fs');
const path = require('path');
const { isDistinctive, cleanNames, packageVersion, lexicon, NODE_MODULES } = require('./common');
const { zipEntries, tarGzEntries } = require('./extract/archive');
const { parseFiles, flatMembers, libFiles } = require('./extract/ts-syntax');
const { parsePyi, flatPyMembers } = require('./extract/pyi');
const { parseDotnetXml } = require('./extract/dotnet-xml');
const { loadClasses, splitName, isPublic, isStatic } = require('./extract/classfile');
const { parseJavaSource, flatJavaSourceMembers } = require('./extract/java-source');
const { parseGoApi } = require('./extract/go-api');
const { parsePhpStub } = require('./extract/php-stubs');
const { parseRbs, flatRbsMembers } = require('./extract/rbs');
const { cachedPath, sourceById, SOURCES } = require('./sources');

const text = (entry) => entry.data.toString('utf8');
const sourceLabel = (id) => {
  const source = sourceById(id);
  return `${id.replace(/^\w+:/, '')}@${source.version} (${source.license})`;
};

// --- JavaScript / TypeScript: TypeScript's lib.d.ts ------------------------------

/** DOM names that are single words but unmistakably the platform's. */
const DOM_KEEP = (
  'window document navigator location history screen console fetch alert confirm prompt performance crypto ' +
  'caches indexedDB localStorage sessionStorage globalThis atob btoa self ' +
  'Node Element Document Window Event EventTarget Blob File FileList FileReader URL Headers Request Response ' +
  'FormData Worker WebSocket Storage Location History Navigator Image Audio Screen Crypto Performance ' +
  'Notification Touch Gamepad Clipboard Animation Cache Selection Range NodeList'
).split(' ');

/** Core JavaScript value types whose methods are recognised on any receiver. */
const JS_VALUE_TYPES = [
  'Array', 'ReadonlyArray', 'String', 'Number', 'Boolean', 'Promise', 'Map', 'ReadonlyMap', 'Set', 'ReadonlySet',
  'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Function', 'Object', 'Error', 'ArrayBuffer', 'Uint8Array',
  'Iterator', 'IteratorObject', 'Generator', 'AsyncGenerator',
];

/** DOM option dictionaries whose keys are kept in library calls (`fetch(url, { method })`). */
const DOM_OPTION_TYPES = [
  'RequestInit', 'ResponseInit', 'EventInit', 'CustomEventInit', 'MouseEventInit', 'KeyboardEventInit', 'PointerEventInit',
  'AddEventListenerOptions', 'EventListenerOptions', 'ScrollToOptions', 'ScrollIntoViewOptions', 'ScrollOptions',
  'IntersectionObserverInit', 'MutationObserverInit', 'ResizeObserverOptions', 'KeyframeAnimationOptions', 'KeyframeEffectOptions',
  'ElementCreationOptions', 'FocusOptions', 'NotificationOptions', 'PositionOptions', 'StructuredSerializeOptions', 'BlobPropertyBag',
  'FilePropertyBag', 'ImageBitmapOptions', 'CanvasRenderingContext2DSettings', 'WebGLContextAttributes', 'RegistrationOptions',
  'ShareData', 'ShadowRootInit', 'GetRootNodeOptions', 'ElementDefinitionOptions', 'WorkerOptions',
  'QueuingStrategy', 'StreamPipeOptions', 'TextDecoderOptions', 'TextDecodeOptions', 'IDBObjectStoreParameters', 'IDBIndexParameters',
  'PermissionDescriptor', 'MediaStreamConstraints', 'MediaTrackConstraints', 'CacheQueryOptions', 'ClipboardItemOptions',
  'PerformanceMarkOptions', 'PerformanceMeasureOptions', 'PerformanceObserverInit', 'UnderlyingSource', 'UnderlyingSink',
];

/** Global objects whose static members are recorded (`Math.max`, `JSON.parse`). */
const JS_STATIC_OWNERS = ['Math', 'JSON', 'Object', 'Array', 'Promise', 'Number', 'String', 'Reflect', 'Date', 'Symbol', 'console', 'Intl', 'Atomics', 'BigInt', 'Map', 'Set', 'Error'];

function buildJavaScript() {
  const libDir = path.dirname(require.resolve('typescript/lib/lib.d.ts'));
  const es = parseFiles(libFiles('lib.esnext.d.ts'));
  const dom = parseFiles(['lib.dom.d.ts', 'lib.dom.iterable.d.ts', 'lib.dom.asynciterable.d.ts'].map((file) => path.join(libDir, file)));
  const scopes = [es, dom];
  const keep = new Set(DOM_KEEP);

  const globals = new Set(es.values.keys());
  const types = new Set(es.types);
  for (const name of es.namespaces.keys()) if (!name.startsWith('"')) globals.add(name);
  for (const name of dom.values.keys()) {
    if (/^on[a-z]/.test(name)) continue;
    if (keep.has(name) || isDistinctive(name)) globals.add(name);
  }
  // Runtime classes (`MouseEvent`) and the option dictionaries; interface-only names (`…EventMap`) do not appear in code.
  for (const name of dom.types) {
    if (keep.has(name) || (isDistinctive(name) && (dom.values.has(name) || DOM_OPTION_TYPES.includes(name)))) types.add(name);
  }

  const members = {};
  for (const owner of JS_STATIC_OWNERS) {
    const type = es.values.get(owner) ?? dom.values.get(owner);
    let names = type ? flatMembers(scopes, type) : new Set();
    const namespace = es.namespaces.get(owner);
    if (namespace) names = new Set([...names, ...namespace.values.keys(), ...namespace.types]);
    members[owner] = names;
  }
  for (const owner of JS_VALUE_TYPES) members[`${owner}.prototype`] = flatMembers(scopes, owner);
  for (const name of DOM_OPTION_TYPES) members[name] = flatMembers(scopes, name);

  return lexicon({
    id: 'javascript',
    languages: ['javascript', 'typescript'],
    sources: [`typescript@${packageVersion('typescript')} lib.esnext + lib.dom (Apache-2.0)`],
    globals,
    types,
    members,
    valueTypes: JS_VALUE_TYPES.map((owner) => `${owner}.prototype`),
    optionTypes: DOM_OPTION_TYPES,
  });
}

// --- Python: typeshed's standard-library stubs (bundled with pyright) -------------

const TYPESHED = path.join(NODE_MODULES, 'pyright', 'dist', 'typeshed-fallback');
const PYTHON_SKIP_BUILTINS = new Set(['copyright', 'credits', 'license', 'exit', 'quit', 'help']);
/** stdlib modules whose names are everyday words: renameable unless imported. */
const PYTHON_GENERIC_MODULES = new Set(
  (
    'code email test this types token string select signal site array numbers queue calendar html http profile ' +
    'secrets operator symbol parser keyword copy mailbox shelve sched trace wave turtle cmd dis resource struct ' +
    'tty stat pwd grp nis crypt imp ast abc enum io glob bisect heapq locale mmap netrc nt posix pty spwd ' +
    'telnetlib tokenize uu xdrlib zipapp antigravity idlelib msvcrt winreg winsound annotationlib compression'
  ).split(' '),
);
const PYTHON_VALUE_TYPES = ['str', 'list', 'dict', 'set', 'frozenset', 'tuple', 'bytes', 'bytearray', 'int', 'float', 'complex'];

function typeshedCommit() {
  const file = path.join(TYPESHED, 'commit.txt');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().slice(0, 12) : 'unknown';
}

function buildPython() {
  const builtins = parsePyi(fs.readFileSync(path.join(TYPESHED, 'stdlib', 'builtins.pyi'), 'utf8'));
  const modules = fs
    .readFileSync(path.join(TYPESHED, 'stdlib', 'VERSIONS'), 'utf8')
    .split('\n')
    .map((line) => /^([a-z]\w*)\s*:/.exec(line)?.[1])
    .filter((name) => name && !PYTHON_GENERIC_MODULES.has(name));
  const members = {};
  for (const owner of PYTHON_VALUE_TYPES) members[owner] = flatPyMembers(builtins.classes, owner);
  return lexicon({
    id: 'python',
    languages: ['python'],
    sources: [`typeshed stdlib @ ${typeshedCommit()} via pyright@${packageVersion('pyright')} (Apache-2.0)`],
    globals: [...builtins.functions, ...builtins.variables].filter((name) => !name.startsWith('_') && !PYTHON_SKIP_BUILTINS.has(name)),
    types: [...builtins.classes.keys()].filter((name) => !name.startsWith('_')),
    namespaces: modules,
    members,
    valueTypes: PYTHON_VALUE_TYPES,
  });
}

// --- C#: .NET reference-assembly documentation ------------------------------------

/** Namespaces C# code uses without qualifying; single-word types only from the core ones. */
const CSHARP_CORE_NAMESPACES = new Set(['System', 'System.Collections.Generic', 'System.Linq', 'System.Threading.Tasks', 'System.IO', 'System.Text']);
const CSHARP_NAMESPACES = new Set([
  ...CSHARP_CORE_NAMESPACES,
  'System.Collections.Concurrent', 'System.Collections.ObjectModel', 'System.Threading', 'System.Text.RegularExpressions',
  'System.Text.Json', 'System.Text.Json.Serialization', 'System.Net', 'System.Net.Http', 'System.Net.Http.Json',
  'System.Diagnostics', 'System.Globalization', 'System.ComponentModel.DataAnnotations', 'System.Security.Claims',
]);
/** BCL types whose members are recognised on any receiver (`text.Split`, `items.Add`). */
const CSHARP_VALUE_TYPES = [
  'System.String', 'System.Object', 'System.Array', 'System.DateTime', 'System.DateTimeOffset', 'System.TimeSpan', 'System.Guid',
  'System.Collections.Generic.List', 'System.Collections.Generic.Dictionary', 'System.Collections.Generic.HashSet',
  'System.Collections.Generic.Queue', 'System.Collections.Generic.Stack', 'System.Collections.Generic.IEnumerable',
  'System.Collections.Generic.ICollection', 'System.Collections.Generic.IList', 'System.Collections.Generic.IDictionary',
  'System.Collections.Generic.KeyValuePair', 'System.Collections.Concurrent.ConcurrentDictionary', 'System.Threading.Tasks.Task',
  'System.Threading.CancellationToken', 'System.Text.StringBuilder', 'System.IO.Stream', 'System.Net.Http.HttpClient',
  'System.Net.Http.HttpResponseMessage', 'System.Uri', 'System.Text.RegularExpressions.Regex', 'System.Text.RegularExpressions.Match',
];

/** Members of parsed .NET docs by type full name without generic arity (`System.Collections.Generic.List`). */
function dotnetTypesByName(parsed, { methodsOnly = false } = {}) {
  const byName = new Map();
  for (const type of parsed.types.values()) {
    const key = `${type.ns}.${type.name}`;
    if (!byName.has(key)) byName.set(key, new Set());
    for (const member of methodsOnly ? type.methods : type.members) byName.get(key).add(member);
  }
  return byName;
}

/** Member names fit for a lexicon: no accessors, operators or compiler-generated names. */
const dotnetMember = (name) => /^[A-Za-z]\w*$/.test(name) && !/^(?:op_|get_|set_|add_|remove_)/.test(name) && !name.includes('_');

function dotnetDocs(ids) {
  const texts = [];
  for (const id of ids) {
    for (const entry of zipEntries(cachedPath(id), (name) => /^(?:ref|lib)\/net[\d.]+\/[^/]+\.xml$/.test(name))) texts.push(text(entry));
  }
  return parseDotnetXml(texts);
}

/** Type names of the given namespaces; `Foo` too for `FooAttribute` (C# `[Foo]`). */
function dotnetTypeNames(parsed, inNamespace, allowSingleWord) {
  const names = new Set();
  for (const type of parsed.types.values()) {
    // Extension-method holders (`ServiceCollectionExtensions`) are never written by name.
    if (!inNamespace(type.ns) || !/^[A-Z]\w*$/.test(type.name) || /Extensions$/.test(type.name)) continue;
    if (allowSingleWord(type.ns) || isDistinctive(type.name)) names.add(type.name);
    // Attributes are written without the suffix inside `[…]`: `[Required]`, `[Key]`.
    if (/^\w+Attribute$/.test(type.name) && type.name.length > 'Attribute'.length) names.add(type.name.slice(0, -'Attribute'.length));
  }
  return names;
}

function buildCSharp() {
  const ids = ['nuget:microsoft.netcore.app.ref'];
  const parsed = dotnetDocs(ids);
  const byName = dotnetTypesByName(parsed);
  const members = {};
  for (const owner of CSHARP_VALUE_TYPES) {
    const simple = owner.split('.').pop();
    const names = [...(byName.get(owner) ?? []), ...(parsed.extensions.get(simple) ?? [])].filter(dotnetMember);
    members[simple] = names;
  }
  return lexicon({
    id: 'csharp',
    languages: ['csharp'],
    sources: ids.map(sourceLabel),
    types: dotnetTypeNames(parsed, (ns) => CSHARP_NAMESPACES.has(ns), (ns) => CSHARP_CORE_NAMESPACES.has(ns)),
    members,
    valueTypes: CSHARP_VALUE_TYPES.map((owner) => owner.split('.').pop()),
  });
}

// --- Java: GWT's JRE emulation (Apache-2.0) ----------------------------------------

const JAVA_PACKAGES = new Set([
  'java.lang', 'java.util', 'java.util.function', 'java.util.stream', 'java.io', 'java.math', 'java.nio.charset',
  'java.util.concurrent', 'java.util.concurrent.atomic', 'java.util.logging', 'java.text', 'java.sql', 'java.security', 'java.lang.annotation',
]);
const JAVA_VALUE_TYPES = [
  'Object', 'String', 'StringBuilder', 'CharSequence', 'Iterable', 'Collection', 'List', 'ArrayList', 'LinkedList', 'Map', 'HashMap',
  'LinkedHashMap', 'TreeMap', 'Set', 'HashSet', 'LinkedHashSet', 'TreeSet', 'Queue', 'Deque', 'ArrayDeque', 'Iterator', 'Optional',
  'Stream', 'IntStream', 'LongStream', 'Entry', 'Integer', 'Long', 'Double', 'Boolean', 'Character', 'Number', 'Comparable', 'BigDecimal', 'BigInteger',
];

function buildJava() {
  const ids = ['maven:gwt-user'];
  const types = new Map();
  const names = new Set();
  for (const entry of zipEntries(cachedPath('maven:gwt-user'), (name) => /\/emul\/java\/.*\.java$/.test(name))) {
    const parsed = parseJavaSource(text(entry));
    if (!JAVA_PACKAGES.has(parsed.pkg)) continue;
    for (const [name, type] of parsed.types) {
      if (type.isPublic) names.add(name);
      const existing = types.get(name);
      if (existing) for (const member of type.members) existing.members.add(member);
      else types.set(name, type);
    }
  }
  const members = {};
  for (const owner of JAVA_VALUE_TYPES) members[owner] = flatJavaSourceMembers(types, owner);
  return lexicon({
    id: 'java',
    languages: ['java'],
    sources: ids.map((id) => `${sourceLabel(id)} JRE emulation`),
    types: names,
    members,
    valueTypes: JAVA_VALUE_TYPES,
  });
}

// --- Kotlin: kotlin-stdlib class files ----------------------------------------------

const KOTLIN_TYPE_PACKAGES = new Set(['kotlin', 'kotlin.collections', 'kotlin.text', 'kotlin.ranges', 'kotlin.sequences', 'kotlin.io', 'kotlin.random', 'kotlin.time', 'kotlin.properties', 'kotlin.comparisons', 'kotlin.coroutines']);

function buildKotlin() {
  const ids = ['maven:kotlin-stdlib'];
  const classes = loadClasses(zipEntries(cachedPath('maven:kotlin-stdlib'), (name) => /^kotlin\/.*\.class$/.test(name)));
  const topLevel = new Set();
  const extensions = new Set();
  const types = new Set();
  for (const [internal, cls] of classes) {
    const { pkg, simple, outer } = splitName(internal);
    if (/Kt(?:__\w+)?$/.test(simple) && outer.length === 0) {
      // Facade functions; an extension's first local is its receiver, `$this$<name>`.
      for (const method of cls.methods) {
        if (!isStatic(method.flags) || (method.flags & 0x1000) !== 0 || !/^[a-zA-Z_]\w*$/.test(method.name)) continue;
        if (method.firstLocal?.startsWith('$this$')) extensions.add(method.name);
        else topLevel.add(method.name);
      }
      continue;
    }
    if (KOTLIN_TYPE_PACKAGES.has(pkg) && outer.length === 0 && isPublic(cls.access) && /^[A-Z]\w*$/.test(simple) && !/Kt$/.test(simple)) types.add(simple);
  }
  return lexicon({
    id: 'kotlin',
    languages: ['kotlin'],
    sources: ids.map(sourceLabel),
    globals: topLevel,
    types,
    members: { 'kotlin.extensions': extensions },
    valueTypes: ['kotlin.extensions'],
  });
}

// --- Go: the standard library's API listing -----------------------------------------

/** Package names that are everyday words: kept only through an import. */
const GO_GENERIC_PACKAGES = new Set('user list ring heap mail color image draw palette token types constant scanner ast doc build format printer parser trace debug metrics signal js unique weak testing iter quick'.split(' '));
const GO_VALUE_TYPES = [
  'context.Context', 'sync.WaitGroup', 'sync.Mutex', 'sync.RWMutex', 'sync.Once', 'sync.Map', 'strings.Builder', 'bytes.Buffer',
  'net/http.Request', 'net/http.Response', 'net/http.Client', 'net/http.ResponseWriter', 'net/http.Header', 'net/http.Server',
  'time.Time', 'time.Duration', 'database/sql.DB', 'database/sql.Rows', 'database/sql.Row', 'database/sql.Tx', 'encoding/json.Encoder',
  'encoding/json.Decoder', 'os.File', 'bufio.Scanner', 'bufio.Reader', 'bufio.Writer', 'net/url.URL', 'net/url.Values', 'log.Logger',
  'log/slog.Logger', 'regexp.Regexp', 'testing.T', 'testing.B',
];

function goSourceIds() {
  return SOURCES.filter((source) => source.id.startsWith('go:')).map((source) => source.id);
}

function buildGo() {
  const ids = goSourceIds();
  const packages = parseGoApi(ids.map((id) => fs.readFileSync(cachedPath(id), 'utf8')));
  const namespaces = new Set();
  for (const pkg of packages.values()) if (!GO_GENERIC_PACKAGES.has(pkg.name)) namespaces.add(pkg.name);
  const members = { 'go.methods': new Set() };
  for (const owner of GO_VALUE_TYPES) {
    const dot = owner.lastIndexOf('.');
    for (const name of packages.get(owner.slice(0, dot))?.types.get(owner.slice(dot + 1)) ?? []) members['go.methods'].add(name);
  }
  return lexicon({
    id: 'go',
    languages: ['go'],
    sources: [`golang/go ${sourceById(ids[0]).version} api/go1*.txt (BSD-3-Clause)`],
    namespaces,
    members,
    valueTypes: ['go.methods'],
  });
}

// --- PHP: JetBrains phpstorm-stubs --------------------------------------------------

/** Extensions bundled with (or nearly always enabled in) PHP. */
const PHP_EXTENSIONS = new Set(['Core', 'standard', 'date', 'json', 'pcre', 'SPL', 'PDO', 'mbstring', 'ctype', 'filter', 'hash', 'random', 'Reflection', 'session', 'curl', 'fileinfo', 'openssl', 'zlib', 'libxml', 'dom', 'SimpleXML', 'iconv', 'intl', 'tokenizer', 'xml', 'sodium', 'mysqli']);
const PHP_VALUE_TYPES = ['DateTime', 'DateTimeImmutable', 'DateTimeInterface', 'DateInterval', 'PDO', 'PDOStatement', 'ArrayObject', 'ArrayIterator', 'SplObjectStorage', 'Throwable', 'Exception', 'Closure', 'Generator', 'Iterator', 'IteratorAggregate', 'Countable', 'ArrayAccess', 'mysqli', 'mysqli_result', 'DOMDocument', 'DOMElement', 'SimpleXMLElement'];

function buildPhp() {
  const ids = ['github:phpstorm-stubs'];
  const functions = new Set();
  const classes = new Map();
  for (const entry of tarGzEntries(cachedPath('github:phpstorm-stubs'), (name) => /^[^/]+\/([^/]+)\/[^/]+\.php$/.test(name) && PHP_EXTENSIONS.has(name.split('/')[1]))) {
    const parsed = parsePhpStub(text(entry));
    for (const name of parsed.functions) functions.add(name);
    for (const [name, cls] of parsed.classes) {
      if (!classes.has(name)) classes.set(name, new Set());
      for (const member of cls.members) classes.get(name).add(member);
    }
  }
  const members = {};
  for (const owner of PHP_VALUE_TYPES) members[owner] = classes.get(owner) ?? [];
  return lexicon({
    id: 'php',
    languages: ['php'],
    sources: ids.map(sourceLabel),
    globals: functions,
    types: classes.keys(),
    members,
    valueTypes: PHP_VALUE_TYPES,
  });
}

// --- Ruby: RBS core signatures ------------------------------------------------------

const RUBY_VALUE_TYPES = ['Object', 'String', 'Symbol', 'Array', 'Hash', 'Integer', 'Float', 'Numeric', 'Enumerable', 'Enumerator', 'Range', 'Comparable', 'NilClass', 'Proc', 'Time', 'IO', 'File', 'Struct'];

function buildRuby() {
  const ids = ['github:rbs'];
  const classes = parseRbs(tarGzEntries(cachedPath('github:rbs'), (name) => /^[^/]+\/core\/[^/]+\.rbs$/.test(name)).map(text));
  const members = {};
  for (const owner of RUBY_VALUE_TYPES) members[owner] = flatRbsMembers(classes, owner);
  return lexicon({
    id: 'ruby',
    languages: ['ruby'],
    sources: ids.map(sourceLabel),
    // Kernel's methods are called without a receiver (`puts`, `require`, `raise`).
    globals: [...(classes.get('Kernel')?.members ?? []), ...(classes.get('Kernel')?.statics ?? [])],
    types: [...classes].filter(([, cls]) => cls.kind !== 'interface').map(([name]) => name),
    members,
    valueTypes: RUBY_VALUE_TYPES,
  });
}

const LANGUAGES = {
  javascript: { needs: [], build: buildJavaScript },
  python: { needs: [], build: buildPython },
  csharp: { needs: ['nuget:microsoft.netcore.app.ref'], build: buildCSharp },
  java: { needs: ['maven:gwt-user'], build: buildJava },
  kotlin: { needs: ['maven:kotlin-stdlib'], build: buildKotlin },
  go: { needs: goSourceIds(), build: buildGo },
  php: { needs: ['github:phpstorm-stubs'], build: buildPhp },
  ruby: { needs: ['github:rbs'], build: buildRuby },
};

module.exports = { LANGUAGES, dotnetDocs, dotnetTypesByName, dotnetTypeNames, dotnetMember, sourceLabel, TYPESHED, cleanNames };
