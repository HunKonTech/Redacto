import en from '../../src/shared/i18n/locales/en';
import hu from '../../src/shared/i18n/locales/hu';
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
    expect(detectLocale(['de-DE', 'hu-HU', 'en'])).toBe('hu');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
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
    expect(normalizeUiPrefs(null)).toEqual({ theme: 'system', locale: 'auto' });
  });
});
