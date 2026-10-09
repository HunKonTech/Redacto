import { anonymize, anonymizeWithVault } from '../../src/shared/anonymizer';
import { consistentIdentifierSpans } from '../../src/shared/code-identifiers';
import { EntityMap } from '../../src/shared/entity-map';
import { emptyVaultData } from '../../src/shared/identity-vault';
import type { PiiSpan } from '../../src/shared/message-types';
import { stringIndexToByteOffset } from '../../src/shared/text-offsets';

// A Visual Studio selection: the model tagged "GitHub" in one place and
// "Git" + "Hub" in the other, which anonymized to `ORGANIZATION_1Service`
// next to `ORGANIZATION_2ORGANIZATION_3Service`. The whole identifier is
// replaced now, the same way at every occurrence.
const CSHARP = `public sealed partial class GitHubService(
    IHttpClientFactory httpFactory,
    ILogger<GitHubService> log)
{
    public const string ClientName = "github";
}`;

function orgSpan(text: string, needle: string, from = 0): PiiSpan {
  const start = text.indexOf(needle, from);
  return {
    start: stringIndexToByteOffset(text, start),
    end: stringIndexToByteOffset(text, start + needle.length),
    entity_type: 'ORGANIZATION',
    score: 0.9,
    text: needle,
    source: 'ner',
  };
}

const second = CSHARP.indexOf('ILogger<');
const SPLIT = [orgSpan(CSHARP, 'GitHub'), orgSpan(CSHARP, 'Git', second), orgSpan(CSHARP, 'Hub', second)];

describe('consistentIdentifierSpans', () => {
  it('widens a flagged part to the whole identifier at every occurrence', () => {
    const spans = consistentIdentifierSpans(CSHARP, SPLIT);
    expect(spans.map((s) => s.text)).toEqual(['GitHubService', 'GitHubService']);
    expect(spans.map((s) => s.entity_type)).toEqual(['ORGANIZATION', 'ORGANIZATION']);
  });

  it('covers an occurrence the model missed', () => {
    const spans = consistentIdentifierSpans(CSHARP, [orgSpan(CSHARP, 'GitHub')]);
    expect(spans).toHaveLength(2);
  });

  it('turns several parts of one identifier into one span', () => {
    const text = 'var x = new GitHubService();';
    const spans = consistentIdentifierSpans(text, [orgSpan(text, 'Git'), orgSpan(text, 'Hub')]);
    expect(spans.map((s) => s.text)).toEqual(['GitHubService']);
  });

  it('leaves whole-word and prose spans alone', () => {
    const text = 'Ask GitHub Inc about it.';
    const spans = [orgSpan(text, 'GitHub Inc')];
    expect(consistentIdentifierSpans(text, spans)).toEqual(spans);
  });
});

describe('anonymize with split identifier spans', () => {
  it('replaces the whole identifier with one placeholder everywhere', () => {
    const { text } = anonymize(CSHARP, SPLIT, new EntityMap());
    expect(text).toContain('class ORGANIZATION_1(');
    expect(text).toContain('ILogger<ORGANIZATION_1> log');
    expect(text).not.toContain('ORGANIZATION_2');
  });

  it('renames the whole identifier against the vault, with identifier renaming on', () => {
    const { text } = anonymizeWithVault(CSHARP, SPLIT, emptyVaultData(), 'placeholder', new EntityMap(), {
      renameIdentifiers: true,
    });
    const [, name] = /partial class (\w+)\(/.exec(text) ?? [];
    expect(name).toMatch(/^Class\d+$/);
    expect(text).toContain(`ILogger<${name}>`);
    expect(text).not.toContain('ORGANIZATION');
  });
});
