import { normalizeDomain, normalizePublicDomains } from '../../src/shared/public-domains';
import { detectionOptionsFromSettings } from '../../src/shared/detection-config';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { loadSettings } from '../../src/shared/storage';

describe('normalizeDomain', () => {
  test.each([
    ['acme.hu', 'acme.hu'],
    ['  Partner.COM ', 'partner.com'],
    ['https://www.acme.hu/rolunk?x=1', 'acme.hu'],
    ['http://user@shop.acme.co.uk:8080/', 'shop.acme.co.uk'],
    ['acme.hu.', 'acme.hu'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeDomain(raw)).toBe(expected);
  });

  test.each(['', 'acme', 'not a domain', 'https://', '-bad-.com'])('rejects %p', (raw) => {
    expect(normalizeDomain(raw)).toBeNull();
  });
});

describe('normalizePublicDomains', () => {
  test('cleans, drops invalid entries and de-duplicates', () => {
    expect(normalizePublicDomains(['acme.hu', 'www.acme.hu', 42, 'nope', 'https://partner.com/x']))
      .toEqual(['acme.hu', 'partner.com']);
    expect(normalizePublicDomains(undefined)).toEqual([]);
  });
});

describe('public domains in settings', () => {
  test('default to an empty list and reach the pipeline config', () => {
    expect(DEFAULT_SETTINGS.publicDomains).toEqual([]);
    const settings = { ...DEFAULT_SETTINGS, publicDomains: ['acme.hu'] };
    expect(detectionOptionsFromSettings(settings).public_domains).toEqual(['acme.hu']);
  });

  test('are normalized when settings load', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValueOnce({
      pg_settings: { publicDomains: ['WWW.Acme.hu', 'bad'] },
    });
    expect((await loadSettings()).publicDomains).toEqual(['acme.hu']);
  });
});
