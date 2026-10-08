const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { isDistinctive, matchesModule, lexicon } = require('../../scripts/code-lexicon/common');
const { parsePyi, flatPyMembers } = require('../../scripts/code-lexicon/extract/pyi');
const { parseDotnetXml } = require('../../scripts/code-lexicon/extract/dotnet-xml');
const { parseGoApi } = require('../../scripts/code-lexicon/extract/go-api');
const { parsePhpStub } = require('../../scripts/code-lexicon/extract/php-stubs');
const { parseRbs, flatRbsMembers } = require('../../scripts/code-lexicon/extract/rbs');
const { parseJavaSource, flatJavaSourceMembers } = require('../../scripts/code-lexicon/extract/java-source');
const { parseClass, splitName } = require('../../scripts/code-lexicon/extract/classfile');
const { tarGzEntries } = require('../../scripts/code-lexicon/extract/archive');
const { SOURCES } = require('../../scripts/code-lexicon/sources');
const { expandSignals, buildProfile } = require('../../scripts/build-code-lexicon');

describe('name rules', () => {
  test('isDistinctive keeps multi-word and sigil names, not single words', () => {
    for (const name of ['addEventListener', 'MouseEvent', 'HTMLElement', 'Renderer2', '$', '_', 'read_csv']) expect(isDistinctive(name)).toBe(true);
    for (const name of ['Comment', 'status', 'close', 'Router']) expect(isDistinctive(name)).toBe(false);
  });

  test('matchesModule: exact names, and `prefix.*` for a subtree', () => {
    expect(matchesModule('pandas.core.frame', ['pandas.core.*'])).toBe(true);
    expect(matchesModule('pandas.core', ['pandas.core.*'])).toBe(true);
    expect(matchesModule('pandas.corex', ['pandas.core.*'])).toBe(false);
    expect(matchesModule('System.Linq', ['System'])).toBe(false);
  });

  test('lexicon drops private members and empty owners', () => {
    const data = lexicon({ id: 'x', languages: ['python'], sources: [], members: { A: ['b', '_c'], B: [] }, valueTypes: ['A', 'B'] });
    expect(data.members).toEqual({ A: ['b'] });
    expect(data.valueTypes).toEqual(['A']);
  });
});

describe('extractors', () => {
  test('Python stubs: classes, bases, multi-line signatures, re-exports, __getattr__ literals', () => {
    const stub = [
      'from ._impl import read_csv as read_csv, helper',
      'class Base:',
      '    def head(self, n: int = ...) -> Self: ...',
      'class DataFrame(Base, Generic[T]):',
      '    columns: Index',
      '    def groupby(',
      '        self,',
      '        by: str | None = ...,',
      '        *,',
      '        as_index: bool = ...,',
      '    ) -> GroupBy: ...',
      'class ModelBase(type):',
      '    def __getattr__(cls, name: Literal["objects"]) -> Manager: ...',
      'def concat(objs, axis: int = 0): ...',
      'if sys.version_info >= (3, 12):',
      '    def batched(iterable, n): ...',
    ].join('\n');
    const module = parsePyi(stub);
    expect([...module.reexports]).toEqual(['read_csv']);
    expect([...flatPyMembers(module.classes, 'DataFrame')].sort()).toEqual(['columns', 'groupby', 'head']);
    expect(module.classes.get('ModelBase').members.has('objects')).toBe(true);
    expect([...module.functions].sort()).toEqual(['batched', 'concat']);
    expect([...module.params]).toEqual(expect.arrayContaining(['n', 'by', 'as_index', 'objs', 'axis', 'iterable']));
  });

  test('.NET XML docs: types, members, extension methods by extended type', () => {
    const xml = `<doc><members>
      <member name="T:System.Collections.Generic.List\`1"/>
      <member name="M:System.Collections.Generic.List\`1.Add(\`0)"/>
      <member name="P:System.Collections.Generic.List\`1.Count"/>
      <member name="M:Microsoft.Extensions.DependencyInjection.ServiceCollectionServiceExtensions.AddScoped\`\`1(Microsoft.Extensions.DependencyInjection.IServiceCollection)"/>
    </members></doc>`;
    const parsed = parseDotnetXml([xml]);
    const list = parsed.types.get('System.Collections.Generic.List`1');
    expect(list.name).toBe('List');
    expect([...list.members].sort()).toEqual(['Add', 'Count']);
    expect([...list.methods]).toEqual(['Add']);
    expect([...parsed.extensions.get('IServiceCollection')]).toEqual(['AddScoped']);
  });

  test('Go API listing: packages by short name, methods and fields per type', () => {
    const packages = parseGoApi([
      [
        'pkg net/http, method (*Client) Do(*Request) (*Response, error)',
        'pkg net/http, type Response struct, StatusCode int',
        'pkg math/rand/v2, func IntN(int) int',
        'pkg internal/abi, type X int',
      ].join('\n'),
    ]);
    expect([...packages.get('net/http').types.get('Client')]).toEqual(['Do']);
    expect([...packages.get('net/http').types.get('Response')]).toEqual(['StatusCode']);
    expect(packages.get('math/rand/v2').name).toBe('rand');
    expect(packages.has('internal/abi')).toBe(false);
  });

  test('PHP stubs: functions and classes, also inside `namespace { }`', () => {
    const stub = '<?php\nnamespace {\n    function strlen(string $s): int {}\n    class PDO\n    {\n        public function prepare($q) {}\n        const PARAM_INT = 1;\n    }\n}\n';
    const parsed = parsePhpStub(stub);
    expect([...parsed.functions]).toEqual(['strlen']);
    expect([...parsed.classes.get('PDO').members].sort()).toEqual(['PARAM_INT', 'prepare']);
  });

  test('RBS: nested interfaces do not end the class; `self?.` methods are both kinds', () => {
    const classes = parseRbs([
      'module Kernel : BasicObject\n  def self?.puts: (*untyped) -> nil\nend\nclass String\n  interface _Match\n    def =~: (untyped) -> Integer\n  end\n  def upcase: () -> String\n  def empty?: () -> bool\n  include Comparable\nend\nmodule Comparable\n  def between?: (untyped, untyped) -> bool\nend',
    ]);
    expect([...classes.get('Kernel').members]).toEqual(['puts']);
    expect([...flatRbsMembers(classes, 'String')].sort()).toEqual(['between', 'empty', 'upcase']);
  });

  test('Java sources: public types, inherited members through package-private bases', () => {
    const parsed = parseJavaSource(
      'package java.util;\n/** {doc} */\npublic class HashMap<K, V> extends AbstractHashMap<K, V> {\n  public HashMap() {}\n  private static class Node { public void hidden() {} }\n  public V put(K k, V v) { return null; }\n}\nabstract class AbstractHashMap<K, V> implements Map<K, V> {\n  public V get(Object k) { return null; }\n}\npublic interface Map<K, V> {\n  int size();\n}',
    );
    expect(parsed.pkg).toBe('java.util');
    expect(parsed.types.get('HashMap').isPublic).toBe(true);
    expect(parsed.types.get('AbstractHashMap').isPublic).toBe(false);
    expect([...flatJavaSourceMembers(parsed.types, 'HashMap')].sort()).toEqual(['get', 'put', 'size']);
  });

  test('class files: name, supertypes, methods and the receiver local of Kotlin extensions', () => {
    const buffer = classFile({
      name: 'kotlin/collections/CollectionsKt',
      superName: 'java/lang/Object',
      methods: [
        { name: 'listOf', flags: 0x0009, firstLocal: 'elements' },
        { name: 'filter', flags: 0x0009, firstLocal: '$this$filter' },
      ],
    });
    const parsed = parseClass(buffer);
    expect(parsed.name).toBe('kotlin/collections/CollectionsKt');
    expect(parsed.superName).toBe('java/lang/Object');
    expect(parsed.methods.map((m) => [m.name, m.firstLocal])).toEqual([['listOf', 'elements'], ['filter', '$this$filter']]);
    expect(splitName('org/springframework/http/ResponseEntity$BodyBuilder')).toEqual({ pkg: 'org.springframework.http', simple: 'BodyBuilder', outer: ['ResponseEntity'], qualified: 'ResponseEntity.BodyBuilder' });
  });

  test('tar.gz reader follows pax long names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-tar-'));
    const file = path.join(dir, 'a.tar.gz');
    const longName = `${'deep/'.repeat(30)}core/string.rbs`;
    fs.writeFileSync(file, zlib.gzipSync(Buffer.concat([tarEntry('pax', `${longName.length + 15} path=${longName}\n`, 'x'), tarEntry('short', 'class String\nend\n'), Buffer.alloc(1024)])));
    const entries = tarGzEntries(file, (name) => name.endsWith('.rbs'));
    expect(entries.map((entry) => [entry.name, entry.data.toString()])).toEqual([[longName, 'class String\nend\n']]);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('sources and profiles', () => {
  test('every remote source is pinned by SHA-256', () => {
    for (const source of SOURCES) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.license).toBeTruthy();
    }
  });

  test('signals expand `{{members:…}}` and `{{namespaces}}` into alternations', () => {
    const spec = { id: 'p', signals: ['\\$\\.(?:{{members:$}})\\(', { all: ['from (?:{{namespaces}})'] }] };
    const signals = expandSignals(spec, { members: { $: ['each', 'ajax'] }, namespaces: ['fs', 'path'] });
    expect(signals).toEqual(['\\$\\.(?:ajax|each)\\(', { all: ['from (?:path|fs)'] }]);
    expect(() => expandSignals(spec, null)).toThrow(/not available/);
  });

  test('a profile ships only the members the runtime reads', () => {
    const profile = buildProfile(
      { id: 'p', languages: ['python'], signals: [], exclude: ['config'] },
      { sources: ['s'], globals: ['run', 'config'], types: ['Frame'], members: { Frame: ['head'], np: ['zeros'] }, valueTypes: ['Frame'], optionTypes: [] },
    );
    expect(profile.globals).toEqual(['run']);
    expect(profile.members).toEqual({ Frame: ['head'] });
  });
});

// --- Helpers: tiny tar and class-file writers -----------------------------------

function tarEntry(name, content, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write('0000644\0', 100);
  header.write(`${Buffer.byteLength(content).toString(8).padStart(11, '0')}\0`, 124);
  header.write(type, 156);
  header.write('ustar\0', 257);
  const body = Buffer.from(content);
  return Buffer.concat([header, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}

function classFile({ name, superName, methods }) {
  const pool = [];
  const utf8 = (text) => {
    pool.push({ tag: 1, text });
    return pool.length;
  };
  const cls = (text) => {
    const index = utf8(text);
    pool.push({ tag: 7, index });
    return pool.length;
  };
  const thisClass = cls(name);
  const superClass = cls(superName);
  const code = utf8('Code');
  const lvt = utf8('LocalVariableTable');
  const descriptor = utf8('()V');
  const methodEntries = methods.map((method) => ({ ...method, nameIndex: utf8(method.name), localIndex: utf8(method.firstLocal) }));
  const parts = [];
  const u1 = (v) => parts.push(Buffer.from([v]));
  const u2 = (v) => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(v);
    parts.push(b);
  };
  const u4 = (v) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(v);
    parts.push(b);
  };
  u4(0xcafebabe);
  u2(0);
  u2(52);
  u2(pool.length + 1);
  for (const entry of pool) {
    u1(entry.tag);
    if (entry.tag === 1) {
      u2(Buffer.byteLength(entry.text));
      parts.push(Buffer.from(entry.text));
    } else {
      u2(entry.index);
    }
  }
  u2(0x0021);
  u2(thisClass);
  u2(superClass);
  u2(0); // interfaces
  u2(0); // fields
  u2(methodEntries.length);
  for (const method of methodEntries) {
    u2(method.flags);
    u2(method.nameIndex);
    u2(descriptor);
    u2(1); // one attribute: Code
    u2(code);
    // Code: max_stack, max_locals, code_length, code, exception_table_length, attributes_count, LocalVariableTable
    const lvtLength = 2 + 10;
    u4(2 + 2 + 4 + 1 + 2 + 2 + (6 + lvtLength));
    u2(1);
    u2(1);
    u4(1);
    u1(0xb1); // return
    u2(0);
    u2(1);
    u2(lvt);
    u4(lvtLength);
    u2(1);
    u2(0);
    u2(1);
    u2(method.localIndex);
    u2(descriptor);
    u2(0);
  }
  u2(0); // class attributes
  return Buffer.concat(parts);
}
