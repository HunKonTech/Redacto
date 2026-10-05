jest.mock('../../src/shared/i18n/generated', () => ({
  GENERATED_LOCALES: ['de', 'zh-TW'],
  GENERATED_LOCALE_NAMES: { de: 'Deutsch', 'zh-TW': '中文（台灣）' },
}));

import { detectLocale, getLocale, loadLocale, onLocaleChange, setLocale, translate, type Locale } from '../../src/shared/i18n';

// The mocked languages are not in the real generated index's types.
const de = 'de' as Locale;
const zhTw = 'zh-TW' as Locale;

describe('machine-translated languages', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    setLocale('en');
  });

  test('are fetched once from i18n/ and re-render the UI', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ 'common.add': 'Hinzufügen' }) });
    const listener = jest.fn();
    const off = onLocaleChange(listener);
    setLocale(de);
    expect(getLocale()).toBe('de');
    expect(translate('common.add')).toBe('Add');
    await loadLocale(de);
    await loadLocale(de);
    off();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('chrome-extension://test/i18n/de.json');
    expect(translate('common.add')).toBe('Hinzufügen');
    expect(translate('common.tryAgain')).toBe('Try again');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('stay in English when the dictionary cannot be loaded, and retry later', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    setLocale(zhTw);
    await loadLocale(zhTw);
    expect(translate('common.add')).toBe('Add');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ 'common.add': '新增' }) });
    await loadLocale(zhTw);
    expect(translate('common.add')).toBe('新增');
    warn.mockRestore();
  });

  test('bundled languages need no fetch', async () => {
    await loadLocale('hu');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('are detected from the most specific browser tag', () => {
    expect(detectLocale(['de-AT', 'hu'])).toBe('de');
    expect(detectLocale(['zh-TW'])).toBe('zh-TW');
    expect(detectLocale(['zh-Hant-HK'])).toBe('zh-TW');
    expect(detectLocale(['zh-Hans-CN', 'hu'])).toBe('hu');
  });
});
