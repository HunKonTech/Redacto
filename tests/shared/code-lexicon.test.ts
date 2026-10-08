import { activeProfiles, detectProfiles, languageLexicon, profileLexicon, PROFILE_IDS } from '../../src/shared/code-lexicon';

describe('language lexicons', () => {
  test('JavaScript: ES and DOM globals, types, value members and option keys', () => {
    const js = languageLexicon('typescript')!;
    for (const name of ['console', 'document', 'fetch', 'Promise', 'Math', 'HTMLElement', 'MouseEvent', 'Record', 'addEventListener']) {
      expect(js.names).toContain(name);
    }
    for (const member of ['filter', 'map', 'split', 'then']) expect(js.valueMembers).toContain(member);
    for (const key of ['method', 'headers', 'body', 'signal']) expect(js.optionKeys).toContain(key);
    expect(js.members.get('Math')).toContain('max');
  });

  test('JavaScript: single generic DOM words stay out', () => {
    const js = languageLexicon('javascript')!;
    for (const name of ['Comment', 'Text', 'Report', 'status', 'name', 'close', 'onclick']) expect(js.names).not.toContain(name);
  });

  test('Python: builtins, stdlib modules as receivers, value members', () => {
    const py = languageLexicon('python')!;
    for (const name of ['print', 'len', 'isinstance', 'ValueError', 'dict']) expect(py.names).toContain(name);
    for (const module of ['os', 'sys', 'json', 'datetime']) expect(py.namespaces).toContain(module);
    for (const generic of ['email', 'code', 'string', 'test']) expect(py.namespaces).not.toContain(generic);
    for (const member of ['append', 'split', 'items']) expect(py.valueMembers).toContain(member);
    expect(py.names).not.toContain('license');
  });

  test('C#: .NET reference-assembly types, BCL members, attributes without their suffix', () => {
    const cs = languageLexicon('csharp')!;
    for (const name of ['Console', 'Task', 'List', 'Dictionary', 'StringBuilder', 'HttpClient', 'JsonSerializer', 'Required', 'RequiredAttribute']) {
      expect(cs.names).toContain(name);
    }
    for (const member of ['Split', 'Add', 'ContainsKey', 'AddDays', 'GetAsync']) expect(cs.valueMembers).toContain(member);
    // Contextual keywords are identifiers in C#.
    for (const name of ['value', 'file', 'args']) expect(cs.names).not.toContain(name);
  });

  test('Java: GWT JRE emulation types and members (not the GPL JDK)', () => {
    const java = languageLexicon('java')!;
    for (const name of ['String', 'ArrayList', 'HashMap', 'Optional', 'Stream', 'Collectors']) expect(java.names).toContain(name);
    for (const member of ['stream', 'getOrDefault', 'equalsIgnoreCase', 'orElse']) expect(java.valueMembers).toContain(member);
  });

  test('Kotlin: stdlib top-level functions and extension functions apart', () => {
    const kotlin = languageLexicon('kotlin')!;
    for (const name of ['println', 'listOf', 'mapOf', 'require', 'lazy']) expect(kotlin.names).toContain(name);
    for (const member of ['map', 'filter', 'let', 'apply', 'forEach']) expect(kotlin.valueMembers).toContain(member);
    expect(kotlin.names).not.toContain('filter');
  });

  test('Go: standard-library packages as receivers, common types\' methods', () => {
    const go = languageLexicon('go')!;
    for (const pkg of ['fmt', 'http', 'strings', 'json', 'time', 'os', 'context']) expect(go.namespaces).toContain(pkg);
    for (const generic of ['user', 'list', 'color']) expect(go.namespaces).not.toContain(generic);
    for (const member of ['Wait', 'Lock', 'StatusCode', 'WriteString']) expect(go.valueMembers).toContain(member);
    for (const builtin of ['len', 'append', 'make', 'range']) expect(go.names).toContain(builtin);
  });

  test('PHP: core functions and classes from phpstorm-stubs', () => {
    const php = languageLexicon('php')!;
    for (const name of ['array_map', 'json_encode', 'strlen', 'DateTime', 'PDO', 'Exception']) expect(php.names).toContain(name);
    for (const member of ['format', 'prepare', 'getMessage']) expect(php.valueMembers).toContain(member);
  });

  test('Ruby: Kernel methods and core classes from RBS', () => {
    const ruby = languageLexicon('ruby')!;
    for (const name of ['puts', 'require', 'raise', 'loop', 'String', 'Hash', 'attr_accessor']) expect(ruby.names).toContain(name);
    for (const member of ['each', 'map', 'upcase', 'fetch', 'each_with_index']) expect(ruby.valueMembers).toContain(member);
  });

  test('every known language has a lexicon, from its grammar at least', () => {
    expect(languageLexicon('lua')!.names).toEqual(expect.objectContaining({}));
    for (const [language, name] of [['lua', 'local'], ['perl', 'my'], ['sql', 'SELECT'], ['bash', 'echo'], ['x86asm', 'eax'], ['vhdl', 'entity']] as const) {
      expect(languageLexicon(language)!.names).toContain(name);
    }
    expect(languageLexicon('unknown')).toBeUndefined();
  });
});

describe('profiles', () => {
  test('no profile is a hand-written list: each names its machine-readable source', () => {
    for (const id of PROFILE_IDS) {
      const data = require(`../../src/shared/code-lexicon/profiles/${id}.json`);
      expect(data.sources.length).toBeGreaterThan(0);
      expect(data.sources.join(' ')).not.toMatch(/hand-curated/);
    }
  });

  test('generated .NET, JVM and Python profiles', () => {
    const aspnet = profileLexicon('aspnetcore');
    for (const name of ['Ok', 'NotFound', 'CreatedAtAction', 'ControllerBase', 'IActionResult', 'WebApplication']) expect(aspnet.names).toContain(name);
    for (const generic of ['User', 'Url', 'Request']) expect(aspnet.names).not.toContain(generic);
    for (const member of ['AddScoped', 'AddControllers', 'UseAuthorization', 'MapControllers', 'LogInformation']) expect(aspnet.valueMembers).toContain(member);

    const ef = profileLexicon('efcore');
    for (const name of ['DbContext', 'DbSet', 'ModelBuilder']) expect(ef.names).toContain(name);
    for (const member of ['ToListAsync', 'Include', 'HasMaxLength', 'SaveChangesAsync', 'UseSqlServer']) expect(ef.valueMembers).toContain(member);

    const linq = profileLexicon('linq');
    for (const member of ['Where', 'Select', 'ToList', 'FirstOrDefault', 'GroupBy']) expect(linq.valueMembers).toContain(member);

    const spring = profileLexicon('spring');
    for (const name of ['ResponseEntity', 'JpaRepository', 'RestController', 'HttpStatus']) expect(spring.names).toContain(name);
    for (const member of ['findById', 'saveAll', 'getForObject']) expect(spring.valueMembers).toContain(member);

    const junit = profileLexicon('junit');
    for (const name of ['assertEquals', 'assertThrows', 'mock', 'verify', 'assertThat', 'Assertions']) expect(junit.names).toContain(name);
    expect(junit.names).not.toContain('AbstractListAssert');

    const django = profileLexicon('django');
    for (const name of ['render', 'get_object_or_404', 'HttpResponse', 'ListView', 'Q']) expect(django.names).toContain(name);
    for (const member of ['filter', 'select_related', 'objects']) expect(django.valueMembers).toContain(member);
    for (const key of ['max_length', 'on_delete', 'related_name']) expect(django.optionKeys).toContain(key);

    const numpy = profileLexicon('numpy');
    for (const key of ['axis', 'dtype', 'keepdims']) expect(numpy.optionKeys).toContain(key);
    expect(numpy.valueMembers).toContain('reshape');
  });

  test('every profile loads and has names', () => {
    expect(PROFILE_IDS).toEqual(
      expect.arrayContaining(['jquery', 'react', 'lodash', 'node', 'express', 'angular', 'vue', 'rxjs', 'numpy', 'pandas', 'requests', 'django', 'aspnetcore', 'efcore', 'linq', 'spring', 'junit']),
    );
    for (const id of PROFILE_IDS) {
      const profile = profileLexicon(id);
      expect(profile.id).toBe(id);
      expect(profile.names.size + profile.namespaces.size + profile.valueMembers.size).toBeGreaterThan(0);
    }
  });

  test('jQuery: generated from @types/jquery', () => {
    const jquery = profileLexicon('jquery');
    for (const name of ['$', 'jQuery', 'JQuery', 'JQueryStatic']) expect(jquery.names).toContain(name);
    for (const member of ['addClass', 'hide', 'ready', 'on']) expect(jquery.valueMembers).toContain(member);
    expect([...jquery.members.get('$')!]).toEqual(expect.arrayContaining(['ajax', 'each']));
    for (const key of ['url', 'data', 'dataType', 'success']) expect(jquery.optionKeys).toContain(key);
    // Members are not standalone names.
    expect(jquery.names).not.toContain('addClass');
  });

  test('React keeps hooks, not single generic words', () => {
    const react = profileLexicon('react');
    for (const name of ['useState', 'useEffect', 'React', 'createElement']) expect(react.names).toContain(name);
    for (const name of ['memo', 'lazy', 'use', 'version', 'Component']) expect(react.names).not.toContain(name);
  });

  test('Node: core modules are receivers', () => {
    const node = profileLexicon('node');
    for (const module of ['fs', 'path', 'http', 'os', 'crypto', 'child_process']) expect(node.namespaces).toContain(module);
    expect(node.namespaces).not.toContain('test');
  });

  test('profiles apply to their languages, and to unknown code', () => {
    const pandas = profileLexicon('pandas');
    expect(pandas.appliesTo('python')).toBe(true);
    expect(pandas.appliesTo('unknown')).toBe(true);
    expect(pandas.appliesTo('typescript')).toBe(false);
  });
});

describe('profile activation', () => {
  const CASES: Array<[code: string, profiles: string[]]> = [
    ["$('.cart-item').addClass('active');", ['jquery']],
    ['jQuery.ajax({ url: apiUrl });', ['jquery']],
    ['$.each(orders, fn);', ['jquery']],
    ['const [n, setN] = useState(0);', ['react']],
    ["import React from 'react';", ['react']],
    ["_.map(users, 'email')", ['lodash']],
    ["const fs = require('fs');", ['node']],
    ["import { join } from 'node:path';", ['node']],
    ["app.get('/users', handler);", ['express']],
    ["import { Component } from '@angular/core';", ['angular']],
    ["import { ref } from 'vue';", ['vue']],
    ["import { map } from 'rxjs/operators';", ['rxjs']],
    ['import numpy as np', ['numpy']],
    ["df = pd.read_csv('x.csv')", ['pandas']],
    ['r = requests.get(url)', ['requests']],
    ['from django.db import models', ['django']],
    ['[HttpGet("{id}")]', ['aspnetcore']],
    ['public DbSet<Order> Orders { get; set; }', ['efcore']],
    ['var paid = orders.Where(o => o.IsPaid).ToList();', ['linq']],
    ['@RestController\npublic class Api {}', ['spring']],
    ['@Test\nvoid adds() { assertEquals(2, add(1, 1)); }', ['junit']],
  ];

  test.each(CASES)('%s', (code, profiles) => {
    expect(detectProfiles(code)).toEqual(expect.arrayContaining(profiles));
  });

  test('plain code activates nothing', () => {
    for (const code of ['invoiceService.loadInvoice(id);', 'def load(path):\n    return path', 'const total = items.length;', '$x = 1;', '']) {
      expect(detectProfiles(code)).toEqual([]);
    }
  });

  test('a lone `$(` is not enough for jQuery', () => {
    expect(detectProfiles('const panel = $(selector);')).toEqual([]);
    expect(detectProfiles('echo "$(date)"')).toEqual([]);
  });

  test('activeProfiles loads the detected profiles', () => {
    expect(activeProfiles("$('#x').hide()").map((profile) => profile.id)).toEqual(['jquery']);
  });
});
