import { anonymize, anonymizeWithVault } from '../../src/shared/anonymizer';
import {
  HISTORY_STORAGE_KEY,
  bestHistoryMatch,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_TEXT_CHARS,
  clearAnonymizationHistory,
  createHistoryEntry,
  deleteHistoryEntry,
  loadAnonymizationHistory,
  restoreFromHistory,
  saveHistoryEntry,
  usedMappings,
  type HistoryEntry,
} from '../../src/shared/anonymization-history';
import { EntityMap } from '../../src/shared/entity-map';
import { emptyVaultData } from '../../src/shared/identity-vault';
import type { EntityType, PiiSpan } from '../../src/shared/message-types';

let local: Record<string, unknown>;
let session: Record<string, unknown>;

function mockArea(area: 'local' | 'session', store: Record<string, unknown>): void {
  const target = (chrome.storage as unknown as Record<string, Record<string, jest.Mock>>)[area];
  target.get.mockImplementation(async (key: string) => ({ [key]: store[key] }));
  target.set.mockImplementation(async (patch: Record<string, unknown>) => {
    Object.assign(store, patch);
  });
  target.remove.mockImplementation(async (key: string) => {
    delete store[key];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  local = {};
  session = {};
  mockArea('local', local);
  mockArea('session', session);
});

function span(text: string, value: string, type: EntityType, from = 0): PiiSpan {
  const index = text.indexOf(value, from);
  const start = Buffer.byteLength(text.slice(0, index));
  return {
    start,
    end: start + Buffer.byteLength(value),
    entity_type: type,
    score: 0.95,
    text: value,
    source: 'regex',
  };
}

function entry(overrides: Partial<HistoryEntry> = {}, now = 1_000): HistoryEntry {
  return {
    ...createHistoryEntry(
      {
        source: 'paste',
        site: 'chatgpt.com',
        originalText: 'Hi, I am Anna.',
        anonymizedText: 'Hi, I am [PERSON_1].',
        mappings: { '[PERSON_1]': 'Anna' },
        replacedCount: 1,
        renamedIdentifiers: 0,
      },
      now,
    ),
    ...overrides,
  };
}

describe('usedMappings', () => {
  it('keeps only the pairs this text uses from a conversation-wide map', () => {
    const map = new EntityMap({ '[PERSON_1]': 'Anna', '[PERSON_2]': 'Peter', '[EMAIL_1]': 'a@b.de' });

    expect(usedMappings('Ask [PERSON_2] at [EMAIL_1].', map)).toEqual({
      '[PERSON_2]': 'Peter',
      '[EMAIL_1]': 'a@b.de',
    });
  });

  it('counts the bracketless placeholder written inside code', () => {
    const code = 'function getAnnaMuellerInvoice(id) {\n  return id;\n}';
    const { text, entityMap } = anonymize(code, [span(code, 'AnnaMueller', 'PERSON')], new EntityMap());

    expect(text).toContain('getPERSON_1Invoice');
    expect(usedMappings(text, entityMap)).toEqual({ '[PERSON_1]': 'AnnaMueller' });
  });

  it('keeps synthetic values and code aliases, which are not placeholder-shaped', () => {
    const vault = emptyVaultData();
    const text = 'Alice wrote this.';
    const result = anonymizeWithVault(text, [span(text, 'Alice', 'PERSON')], vault, 'synthetic');

    const used = usedMappings(result.text, result.entityMap);
    expect(Object.values(used)).toEqual(['Alice']);
    expect(Object.keys(used)[0]).not.toMatch(/^\[/);
  });
});

describe('restoreFromHistory', () => {
  it('restores a reply, including the forms a model mangles', () => {
    const reply = 'Sure, person 1 should reply to [EMAIL_1].';
    const result = restoreFromHistory(
      reply,
      entry({ mappings: { '[PERSON_1]': 'Anna', '[EMAIL_1]': 'anna@acme.io' } }),
      emptyVaultData(),
      false,
    );

    expect(result.deAnonText).toBe('Sure, Anna should reply to anna@acme.io.');
    expect(result.matches).toHaveLength(2);
  });

  it('restores code whose identifiers carry a bare placeholder', () => {
    const reply = 'const total = getPERSON_1Invoice(3);';
    const result = restoreFromHistory(reply, entry({ mappings: { '[PERSON_1]': 'AnnaMueller' } }), emptyVaultData(), false);

    expect(result.deAnonText).toBe('const total = getAnnaMuellerInvoice(3);');
  });

  it('uses only the selected entry, never tokens it did not use', () => {
    const result = restoreFromHistory('[PERSON_2] met [PERSON_1].', entry(), emptyVaultData(), false);

    expect(result.deAnonText).toBe('[PERSON_2] met Anna.');
  });

  it('resolves the synthetic echo of a placeholder the entry sent, through the vault', () => {
    const vault = emptyVaultData();
    const text = 'Alice wrote this.';
    const result = anonymizeWithVault(text, [span(text, 'Alice', 'PERSON')], vault, 'placeholder');
    const synthetic = vault.records[0].syntheticValue;
    const saved = entry({ mappings: usedMappings(result.text, result.entityMap) });

    expect(restoreFromHistory(`${synthetic} did.`, saved, vault, true).deAnonText).toBe('Alice did.');
    // With cross-session memory off the vault is not consulted.
    expect(restoreFromHistory(`${synthetic} did.`, saved, vault, false).deAnonText).toBe(`${synthetic} did.`);
  });
});

describe('bestHistoryMatch', () => {
  // Newest first, as loadAnonymizationHistory returns them. With cross-session
  // memory off both number their placeholders from 1.
  const newer = entry({ id: 'newer', mappings: { '[PERSON_1]': 'Peter', '[EMAIL_1]': 'peter@acme.io' } }, 2);
  const older = entry({ id: 'older', mappings: { '[PERSON_1]': 'Anna', '[LOCATION_1]': 'Berlin' } }, 1);

  it('picks the entry that accounts for the most distinct tokens', () => {
    const reply = '[PERSON_1] moved to [LOCATION_1]. [PERSON_1] likes it.';
    expect(bestHistoryMatch(reply, [newer, older], emptyVaultData(), false)?.id).toBe('older');
  });

  it('prefers the newest entry when the text cannot tell them apart', () => {
    expect(bestHistoryMatch('Thanks, [PERSON_1]!', [newer, older], emptyVaultData(), false)?.id).toBe('newer');
  });

  it('finds nothing in text without any known token', () => {
    expect(bestHistoryMatch('No placeholders here.', [newer, older], emptyVaultData(), false)).toBeNull();
  });
});

describe('createHistoryEntry', () => {
  it('clips long text and says so', () => {
    const long = 'x'.repeat(MAX_HISTORY_TEXT_CHARS + 10);
    const created = createHistoryEntry({
      source: 'side-panel',
      originalText: long,
      anonymizedText: 'short',
      mappings: {},
      replacedCount: 0,
      renamedIdentifiers: 0,
    });

    expect(created.originalText).toHaveLength(MAX_HISTORY_TEXT_CHARS);
    expect(created.truncated).toBe(true);
    expect(created.site).toBeUndefined();
  });
});

describe('history storage', () => {
  it('keeps entries durably with cross-session memory on, and only for the session with it off', async () => {
    await saveHistoryEntry(entry({ id: 'a' }, 1), true);
    await saveHistoryEntry(entry({ id: 'b' }, 2), false);

    expect((local[HISTORY_STORAGE_KEY] as HistoryEntry[]).map((e) => e.id)).toEqual(['a']);
    expect((session[HISTORY_STORAGE_KEY] as HistoryEntry[]).map((e) => e.id)).toEqual(['b']);
    expect((await loadAnonymizationHistory()).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('replaces an entry saved again under the same id, even across areas', async () => {
    await saveHistoryEntry(entry({ id: 'a', replacedCount: 1 }, 1), false);
    await saveHistoryEntry(entry({ id: 'a', replacedCount: 2 }, 2), true);

    const loaded = await loadAnonymizationHistory();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].replacedCount).toBe(2);
    expect(session[HISTORY_STORAGE_KEY]).toBeUndefined();
  });

  it(`keeps the newest ${MAX_HISTORY_ENTRIES} entries`, async () => {
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 3; i += 1) {
      await saveHistoryEntry(entry({ id: `e${i}` }, i), true);
    }

    const loaded = await loadAnonymizationHistory();
    expect(loaded).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(loaded[0].id).toBe(`e${MAX_HISTORY_ENTRIES + 2}`);
    expect(loaded.some((e) => e.id === 'e0')).toBe(false);
  });

  it('deletes one entry, and clears everything', async () => {
    await saveHistoryEntry(entry({ id: 'a' }, 1), true);
    await saveHistoryEntry(entry({ id: 'b' }, 2), true);
    await saveHistoryEntry(entry({ id: 'c' }, 3), false);

    await deleteHistoryEntry('b');
    expect((await loadAnonymizationHistory()).map((e) => e.id)).toEqual(['c', 'a']);

    await clearAnonymizationHistory();
    expect(await loadAnonymizationHistory()).toEqual([]);
    expect(local[HISTORY_STORAGE_KEY]).toBeUndefined();
    expect(session[HISTORY_STORAGE_KEY]).toBeUndefined();
  });

  it('drops malformed stored entries instead of failing', async () => {
    local[HISTORY_STORAGE_KEY] = [entry({ id: 'ok' }), { id: 'broken' }, null];

    expect((await loadAnonymizationHistory()).map((e) => e.id)).toEqual(['ok']);
  });

  it('reads as empty when session storage is unavailable', async () => {
    const storage = chrome.storage as unknown as Record<string, unknown>;
    const saved = storage.session;
    delete storage.session;
    try {
      await saveHistoryEntry(entry({ id: 'x' }), false);
      expect(await loadAnonymizationHistory()).toEqual([]);
    } finally {
      storage.session = saved;
    }
  });
});
