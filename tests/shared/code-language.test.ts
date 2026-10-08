import { detectCodeLanguage, fenceLabelOf, grammarNames, KNOWN_LANGUAGES, languageFromFenceLabel } from '../../src/shared/code-language';
import { LANGUAGE_SAMPLES } from './code-language-samples';

const SAMPLES: Array<[label: string, code: string, language: string]> = [
  ['TypeScript', "import { readFile } from 'fs/promises';\ninterface Row { id: string }\nexport async function load(path: string): Promise<Row[]> {\n  return JSON.parse(await readFile(path, 'utf8'));\n}", 'typescript'],
  ['JavaScript', "const express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('ok'));", 'javascript'],
  ['Python', 'import requests\n\ndef load(url):\n    return requests.get(url).json()\n', 'python'],
  ['C#', 'using System;\n\npublic class Greeter\n{\n    public string Name { get; set; }\n    public void Hello() => Console.WriteLine(Name);\n}', 'csharp'],
  ['Java', 'package com.acme;\n\nimport java.util.List;\n\npublic class Greeter {\n    @Override\n    public String toString() { return "x"; }\n}', 'java'],
  ['C# with nested generics', 'public class OrderService\n{\n    private readonly AppDbContext _db;\n    public async Task<List<OrderDto>> GetPaidAsync(int id)\n    {\n        return await _db.Orders.ToListAsync();\n    }\n}', 'csharp'],
  ['Java with Spring annotations', '@RestController\npublic class CustomerController {\n    @GetMapping("/customers/{id}")\n    public Customer get(@PathVariable Long id) {\n        return repository.findById(id).orElseThrow();\n    }\n}', 'java'],
  ['Kotlin', 'data class Customer(val name: String)\n\nfun greet(c: Customer) {\n    println("Hello ${c.name}")\n}', 'kotlin'],
  ['Go', 'package main\n\nimport "fmt"\n\nfunc main() {\n    name := "x"\n    fmt.Println(name)\n}', 'go'],
  ['Rust', 'use std::collections::HashMap;\n\nfn main() {\n    let mut seen = HashMap::new();\n    println!("{:?}", seen);\n}', 'rust'],
  ['PHP', '<?php\nclass Customer {\n    private $name;\n    public function getName() { return $this->name; }\n}', 'php'],
];

describe('detectCodeLanguage', () => {
  test.each(SAMPLES)('%s', (_label, code, language) => {
    const guess = detectCodeLanguage(code);
    expect(guess.language).toBe(language);
    expect(guess.confidence).toBeGreaterThan(0.5);
  });

  test('a fence label decides', () => {
    expect(detectCodeLanguage('x = 1', { fenceLabel: 'ts' })).toMatchObject({ language: 'typescript', confidence: 1, source: 'fence' });
    expect(detectCodeLanguage('x = 1', { fenceLabel: 'C#' }).language).toBe('csharp');
    expect(detectCodeLanguage('x = 1', { fenceLabel: 'text' }).source).not.toBe('fence');
  });

  test('a short fragment without strong signals is unknown', () => {
    for (const fragment of ["$('.cart-item').addClass('active');", 'invoiceService.loadInvoice(id);', "df.groupby('city').mean()", '']) {
      expect(detectCodeLanguage(fragment)).toMatchObject({ language: 'unknown', confidence: 0 });
    }
  });

  test('C-family evidence rules Python out even when the language is unclear', () => {
    expect(detectCodeLanguage('invoiceService.loadInvoice(id);').ruledOut).toContain('python');
    expect(detectCodeLanguage('if (a && b) run(x)').ruledOut).toContain('python');
    expect(detectCodeLanguage("df.groupby('city').mean()").ruledOut).toEqual([]);
  });

  test('only the start of a long region is read', () => {
    const code = `import os\n\ndef run():\n    return os.getcwd()\n${'# filler line\n'.repeat(2000)}`;
    expect(detectCodeLanguage(code).language).toBe('python');
  });
});

describe('fifty languages', () => {
  test('there is a sample for every known language', () => {
    expect(KNOWN_LANGUAGES).toHaveLength(50);
    expect(Object.keys(LANGUAGE_SAMPLES).sort()).toEqual([...KNOWN_LANGUAGES].sort());
  });

  test.each(Object.entries(LANGUAGE_SAMPLES))('%s is detected', (language, code) => {
    expect(detectCodeLanguage(code).language).toBe(language);
  });

  test('every language has a fence label', () => {
    for (const language of KNOWN_LANGUAGES) {
      const label = language === 'objectivec' ? 'objc' : language;
      expect(languageFromFenceLabel(label)).toBe(language);
    }
  });

  test('grammars give keywords and built-ins', () => {
    expect(grammarNames('lua')!.keywords).toEqual(expect.arrayContaining(['local', 'elseif', 'then']));
    expect(grammarNames('lua')!.builtIns).toEqual(expect.arrayContaining(['ipairs', 'pairs']));
    expect(grammarNames('elixir')!.keywords).toContain('defmodule');
    // Case-insensitive languages in every case.
    expect(grammarNames('sql')!.keywords).toEqual(expect.arrayContaining(['select', 'SELECT', 'Select']));
    expect(grammarNames('unknown')).toBeUndefined();
  });
});

describe('fence labels', () => {
  test('fenceLabelOf reads the label after the opening fence', () => {
    const text = 'Here:\n```typescript title="a.ts"\nlet a = 1;\n```';
    expect(fenceLabelOf(text, text.indexOf('```'))).toBe('typescript title="a.ts"');
    expect(fenceLabelOf('```\ncode\n```', 0)).toBeUndefined();
    expect(fenceLabelOf('let a = 1;', 0)).toBeUndefined();
  });

  test('languageFromFenceLabel maps common aliases', () => {
    expect(languageFromFenceLabel('typescript title="a.ts"')).toBe('typescript');
    expect(languageFromFenceLabel('py')).toBe('python');
    expect(languageFromFenceLabel('golang')).toBe('go');
    expect(languageFromFenceLabel('mermaid')).toBeUndefined();
    expect(languageFromFenceLabel(undefined)).toBeUndefined();
  });
});
