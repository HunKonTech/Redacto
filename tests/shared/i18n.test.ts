import fs from 'fs';
import path from 'path';
import en from '../../src/shared/i18n/locales/en';
import hu from '../../src/shared/i18n/locales/hu';
import { GENERATED_LOCALES, GENERATED_LOCALE_NAMES } from '../../src/shared/i18n/generated';
import {
  detectLocale,
  getLocale,
  onLocaleChange,
  registerMessages,
  resolveLocale,
  setLocale,
  translate,
  translatePlural,
} from '../../src/shared/i18n';
import { normalizeUiPrefs } from '../../src/shared/ui-prefs';

const placeholders = (message: string): string[] => [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const GENERATED_DIR = path.join(__dirname, '../../src/shared/i18n/generated/locales');
const generatedFiles = fs.existsSync(GENERATED_DIR) ? fs.readdirSync(GENERATED_DIR).filter((f) => f.endsWith('.json')) : [];
const readGenerated = (file: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(GENERATED_DIR, file), 'utf8'));

describe('dictionaries', () => {
  test('Hungarian has exactly the English keys', () => {
    expect(Object.keys(hu).sort()).toEqual(Object.keys(en).sort());
  });

  test('every translation keeps the placeholders of the English message', () => {
    for (const [key, message] of Object.entries(en)) {
      expect({ key, params: placeholders(hu[key as keyof typeof en]) }).toEqual({ key, params: placeholders(message) });
    }
  });

  test('no message is empty', () => {
    for (const dictionary of [en, hu]) {
      for (const [key, message] of Object.entries(dictionary)) {
        expect({ key, empty: message.trim() === '' }).toEqual({ key, empty: false });
      }
    }
  });
});

describe('machine-translated dictionaries', () => {
  test('the generated index lists exactly the dictionary files, each with a name', () => {
    expect([...GENERATED_LOCALES].sort()).toEqual(generatedFiles.map((f) => path.basename(f, '.json')).sort());
    for (const locale of GENERATED_LOCALES) expect(GENERATED_LOCALE_NAMES[locale]).toBeTruthy();
  });

  test('each has only English keys, non-empty, with their placeholders', () => {
    for (const file of generatedFiles) {
      for (const [key, message] of Object.entries(readGenerated(file))) {
        expect({ file, key, known: key in en }).toEqual({ file, key, known: true });
        expect({ file, key, empty: message.trim() === '' }).toEqual({ file, key, empty: false });
        expect({ file, key, params: placeholders(message) }).toEqual({
          file,
          key,
          params: placeholders(en[key as keyof typeof en]),
        });
      }
    }
  });
});

describe('translate', () => {
  afterEach(() => setLocale('en'));

  test('fills in placeholders', () => {
    setLocale('en');
    expect(translate('common.removeItem', { item: 'Smith' })).toBe('Remove Smith');
    setLocale('hu');
    expect(translate('common.removeItem', { item: 'Smith' })).toBe('Smith eltávolítása');
  });

  test('leaves unknown placeholders as written', () => {
    expect(translate('common.removeItem')).toBe('Remove {item}');
  });

  test('picks the plural form for the count', () => {
    expect(translatePlural('common.spans', 1)).toBe('1 span');
    expect(translatePlural('common.spans', 3)).toBe('3 spans');
    setLocale('hu');
    expect(translatePlural('common.spans', 3)).toBe('3 találat');
  });

  test('falls back to English for a key a registered dictionary lacks', () => {
    setLocale('hu');
    registerMessages('hu', { 'common.add': 'Új' });
    expect(translate('common.add')).toBe('Új');
    registerMessages('hu', { 'common.add': hu['common.add'] });
  });

  test('notifies listeners on a language change', () => {
    const listener = jest.fn();
    const off = onLocaleChange(listener);
    setLocale('hu');
    setLocale('hu');
    off();
    setLocale('en');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLocale()).toBe('en');
  });
});

describe('locale detection', () => {
  test('takes the first supported browser language', () => {
    expect(detectLocale(['xx-XX', 'hu-HU', 'en'])).toBe('hu');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['xx'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  test('matches the most specific tag of a machine-translated language', () => {
    const supported = new Set<string>(GENERATED_LOCALES);
    if (supported.has('zh-TW')) {
      expect(detectLocale(['zh-TW'])).toBe('zh-TW');
      expect(detectLocale(['zh-Hant-HK'])).toBe('zh-TW');
    }
    if (supported.has('zh')) expect(detectLocale(['zh-Hans-CN'])).toBe('zh');
    if (supported.has('no')) expect(detectLocale(['nb-NO'])).toBe('no');
    if (supported.has('de')) expect(detectLocale(['de-AT', 'hu'])).toBe('de');
  });

  test('an explicit preference wins over the browser', () => {
    expect(resolveLocale('hu', ['en-US'])).toBe('hu');
    expect(resolveLocale('auto', ['hu'])).toBe('hu');
    expect(resolveLocale(undefined, ['en'])).toBe('en');
  });
});

describe('UI preferences', () => {
  test('drops unknown values', () => {
    expect(normalizeUiPrefs({ theme: 'dark', locale: 'hu' })).toEqual({ theme: 'dark', locale: 'hu' });
    expect(normalizeUiPrefs({ theme: 'neon', locale: 'xx' })).toEqual({ theme: 'system', locale: 'auto' });
    for (const locale of GENERATED_LOCALES) {
      expect(normalizeUiPrefs({ theme: 'dark', locale })).toEqual({ theme: 'dark', locale });
    }
    expect(normalizeUiPrefs(null)).toEqual({ theme: 'system', locale: 'auto' });
  });
});
