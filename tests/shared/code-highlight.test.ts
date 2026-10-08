import { confidentLanguage, syntaxPieces, syntaxRuns } from '../../src/shared/code-highlight';

const PYTHON = '```python\ndef load(path):\n    return open(path)  # read it\n```';

describe('syntaxRuns', () => {
  test('colours a confidently recognised block and leaves the prose plain', () => {
    const text = `Here it is:\n\n${PYTHON}`;
    const runs = syntaxRuns(text);
    const coloured = runs.map((run) => [text.slice(run.start, run.end), run.kind]);
    expect(coloured).toContainEqual(['def', 'keyword']);
    expect(coloured).toContainEqual(['# read it', 'comment']);
    expect(runs.every((run) => run.start >= text.indexOf('def'))).toBe(true);
  });

  test('an unsure fragment is plain on its own and coloured with a shared language', () => {
    const fragment = '```\nitems = sorted(load(p))\n```';
    expect(syntaxRuns(fragment)).toEqual([]);
    const runs = syntaxRuns(fragment, 'python');
    expect(runs.map((run) => fragment.slice(run.start, run.end))).toContain('sorted');
  });

  test('runs keep the text intact', () => {
    const text = '```ts\nconst a: string = "<b>&amp;</b>";\n```';
    const pieces = syntaxPieces(text, syntaxRuns(text));
    expect(pieces.map((piece) => piece.text).join('')).toBe(text);
    expect(pieces.some((piece) => piece.kind === 'string' && piece.text === '"<b>&amp;</b>"')).toBe(true);
  });
});

describe('confidentLanguage', () => {
  test('the language the related fields agree on', () => {
    expect(confidentLanguage([PYTHON, 'Thanks, try `x = 1`.'])).toBe('python');
  });

  test('none when confident regions disagree', () => {
    expect(confidentLanguage([PYTHON, '```sql\nSELECT 1;\n```'])).toBeUndefined();
  });
});

describe('syntaxPieces', () => {
  test('cuts a sub-range', () => {
    const runs = [{ start: 2, end: 5, kind: 'keyword' as const }];
    expect(syntaxPieces('abcdefg', runs, 3, 6)).toEqual([{ text: 'de', kind: 'keyword' }, { text: 'f' }]);
  });
});
