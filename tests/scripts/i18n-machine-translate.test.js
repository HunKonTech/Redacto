const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  asciiLiteral,
  changedSourceKeys,
  keepValidTranslations,
  nativeName,
  readDictsFile,
  readSourceMessages,
  renderIndex,
  toLocale,
  writeDictsFile,
} = require('../../scripts/i18n/machine-translate');

function tempFile(content) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pg-i18n-')), 'i18n.ts');
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

describe('readSourceMessages', () => {
  test('reads the English dictionary from en.ts', () => {
    const en = readSourceMessages();
    expect(en['common.add']).toBe('Add');
    expect(en['common.spans_other']).toBe('{count} spans');
  });
});

describe('the DICTS file for KO_language_translator', () => {
  test('is plain ASCII with escapes Python unicode_escape decodes', () => {
    expect(asciiLiteral('Detecting…')).toBe('"Detecting\\u2026"');
    expect(asciiLiteral('😀 "quoted"\n')).toBe('"\\U0001f600 \\"quoted\\"\\n"');
  });

  test('lists English first, then each language under its Google code', () => {
    const file = tempFile();
    writeDictsFile(file, { a: 'One' }, [{ googleCode: 'zh-CN', messages: { a: '一' } }]);
    expect(fs.readFileSync(file, 'utf8')).toBe(
      'const DICTS = {\n  "en": {\n    "a": "One",\n  },\n  "zh-CN": {\n    "a": "\\u4e00",\n  },\n};\n',
    );
  });

  test('reads back the layout main.py writes', () => {
    const file = tempFile(
      [
        'const DICTS = {',
        '  en: {',
        '    "a": "Say \\"hi\\"\\nto {name}",',
        '  },',
        '  zh-CN: {',
        '    "a": "对 {name} 说\\\\“你好”",',
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    expect(readDictsFile(file)).toEqual({
      en: { a: 'Say "hi"\nto {name}' },
      'zh-CN': { a: '对 {name} 说\\“你好”' },
    });
  });
});

describe('translation checks', () => {
  const en = { a: 'Remove {item}', b: '{count} spans', c: 'Plain' };

  test('drops translations that lose or rename a placeholder', () => {
    const report = jest.fn();
    expect(keepValidTranslations(en, { a: '{item} entfernen', b: '{Anzahl} Treffer', c: '', d: 'extra' }, report)).toEqual({
      a: '{item} entfernen',
    });
    expect(report).toHaveBeenCalledWith('b', '{Anzahl} Treffer');
  });

  test('finds keys whose English text changed', () => {
    expect(changedSourceKeys(en, { a: 'Remove {item}', b: '{count} hits', z: 'gone' })).toEqual(['b']);
  });
});

describe('language codes and names', () => {
  test('maps Google codes to browser language tags', () => {
    expect(toLocale('iw')).toBe('he');
    expect(toLocale('zh-CN')).toBe('zh');
    expect(toLocale('zh-TW')).toBe('zh-TW');
    expect(toLocale('de')).toBe('de');
  });

  test('names a language in itself, else in English', () => {
    expect(nativeName('de', 'german')).toBe('Deutsch');
    expect(nativeName('qq', 'made up')).toBe('Made Up');
  });

  test('renders the generated index sorted by name', () => {
    const source = renderIndex([
      { locale: 'fr', name: 'Français' },
      { locale: 'de', name: 'Deutsch' },
    ]);
    expect(source).toContain('export const GENERATED_LOCALES = [\n  "de",\n  "fr",\n] as const;');
    expect(source).toContain('"fr": "Français",');
  });
});
