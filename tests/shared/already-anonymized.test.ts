import { anonymize, anonymizeWithVault } from '../../src/shared/anonymizer';
import {
  dropKnownReplacements,
  knownReplacementTokens,
  textFingerprint,
} from '../../src/shared/already-anonymized';
import { createHistoryEntry, findEntryForAnonymizedText, usedMappings } from '../../src/shared/anonymization-history';
import { EntityMap } from '../../src/shared/entity-map';
import { emptyVaultData } from '../../src/shared/identity-vault';
import type { EntityType, PiiSpan } from '../../src/shared/message-types';

/**
 * Text anonymized once — the side panel's output, or a message copied from
 * one chat into another — must go through a second anonymization unchanged.
 * Replacing its replacements breaks the way back to the originals.
 */

const RENAME = { renameIdentifiers: true };
const CODE =
  'class InvoiceRow {\n  constructor(amount) { this.amount = amount; }\n}\n' +
  'function loadInvoices(rows) {\n  return rows.map((r) => new InvoiceRow(r));\n}';

function span(text: string, value: string, type: EntityType): PiiSpan {
  const index = text.indexOf(value);
  const start = Buffer.byteLength(text.slice(0, index));
  return { start, end: start + Buffer.byteLength(value), entity_type: type, score: 0.95, text: value, source: 'ner' };
}

describe('anonymizing already-anonymized text', () => {
  it('leaves renamed code alone with cross-session memory on', () => {
    const vault = emptyVaultData();
    const first = anonymizeWithVault(CODE, [], vault, 'placeholder', new EntityMap(), RENAME);
    expect(first.text).toContain('Class1');

    const second = anonymizeWithVault(first.text, [], vault, 'placeholder', new EntityMap(), RENAME);

    expect(second.text).toBe(first.text);
    expect(vault.records.map((record) => record.originalText)).not.toContain('Class1');
  });

  it('leaves renamed code alone with it off, given the history tokens', () => {
    const first = anonymize(CODE, [], new EntityMap(), RENAME);
    const historyTokens = Object.keys(usedMappings(first.text, first.entityMap));

    const second = anonymize(first.text, [], new EntityMap(), { ...RENAME, knownReplacements: historyTokens });

    expect(second.text).toBe(first.text);
  });

  it('does not replace a synthetic name that detection flags as a person', () => {
    const vault = emptyVaultData();
    const original = 'Anna Mueller signed the contract.';
    const first = anonymizeWithVault(original, [span(original, 'Anna Mueller', 'PERSON')], vault, 'synthetic');
    const synthetic = vault.records[0].syntheticValue;
    expect(first.text).toBe(`${synthetic} signed the contract.`);

    const second = anonymizeWithVault(first.text, [span(first.text, synthetic, 'PERSON')], vault, 'synthetic');

    expect(second.text).toBe(first.text);
    expect(vault.records).toHaveLength(1);
  });

  it('anonymizes new personal data next to old replacements, with a label of its own', () => {
    const vault = emptyVaultData();
    const text = '[PERSON_1] will meet Peter Mayer.';

    const result = anonymizeWithVault(
      text,
      [span(text, 'PERSON_1', 'PERSON'), span(text, 'Peter Mayer', 'PERSON')],
      vault,
      'placeholder',
      new EntityMap(),
      { knownReplacements: ['[PERSON_1]'] },
    );

    expect(result.text).toBe('[PERSON_1] will meet [PERSON_2].');
    expect(vault.records.map((record) => record.originalText)).toEqual(['Peter Mayer']);
  });

  it('numbers around old placeholders with cross-session memory off too', () => {
    const text = '[PERSON_1] will meet Peter Mayer.';

    const result = anonymize(text, [span(text, 'Peter Mayer', 'PERSON')], new EntityMap(), {
      knownReplacements: ['[PERSON_1]'],
    });

    expect(result.text).toBe('[PERSON_1] will meet [PERSON_2].');
  });
});

describe('knownReplacementTokens', () => {
  it('includes the bracketless placeholder written inside code', () => {
    const known = knownReplacementTokens({ mappings: [{ '[PERSON_1]': 'Anna' }] });
    expect(known.has('[PERSON_1]')).toBe(true);
    expect(known.has('PERSON_1')).toBe(true);
  });

  it('drops spans that are a known token, and keeps the rest', () => {
    const text = 'Jordan Park met Anna.';
    const spans = [span(text, 'Jordan Park', 'PERSON'), span(text, 'Anna', 'PERSON')];

    expect(dropKnownReplacements(spans, new Set(['Jordan Park'])).map((s) => s.text)).toEqual(['Anna']);
  });
});

describe('recognising a pasted anonymized text', () => {
  const entry = createHistoryEntry({
    source: 'side-panel',
    originalText: 'Hi Anna.',
    anonymizedText: 'Hi [PERSON_1].\nThanks.',
    mappings: { '[PERSON_1]': 'Anna' },
    replacedCount: 1,
    renamedIdentifiers: 0,
  });

  it('matches the whole text, whatever the clipboard did to line breaks', () => {
    expect(findEntryForAnonymizedText('Hi [PERSON_1].\r\nThanks.\n', [entry])?.id).toBe(entry.id);
    expect(textFingerprint('a\r\nb')).toBe(textFingerprint('a\nb'));
  });

  it('does not match a part or an edited copy', () => {
    expect(findEntryForAnonymizedText('Hi [PERSON_1].', [entry])).toBeNull();
    expect(findEntryForAnonymizedText('Hi [PERSON_1].\nThank you.', [entry])).toBeNull();
  });
});
