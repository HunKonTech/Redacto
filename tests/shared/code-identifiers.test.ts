import { anonymize } from '../../src/shared/anonymizer';
import {
  buildIdentifierSplitView,
  createIdentifierPositionCheck,
  dropGenericIdentifierSpans,
  findCodeLikeRegions,
  mapViewSpansToOriginal,
  propagateIdentifierSpans,
} from '../../src/shared/code-identifiers';
import { deAnonymize } from '../../src/shared/de-anonymizer';
import type { PiiSpan } from '../../src/shared/message-types';
import { stringIndexToByteOffset } from '../../src/shared/text-offsets';

const PYTHON_SNIPPET = [
  'def getAdaLovelaceInvoice(ada_lovelace_id):',
  '    total = load(ada_lovelace_id)',
  '    return total',
].join('\n');

function nerSpan(text: string, needle: string, from = 0): PiiSpan {
  const start = text.indexOf(needle, from);
  if (start === -1) throw new Error(`${needle} not found`);
  return {
    start: stringIndexToByteOffset(text, start),
    end: stringIndexToByteOffset(text, start + needle.length),
    entity_type: 'PERSON',
    score: 0.92,
    text: needle,
    source: 'ner',
  };
}

describe('findCodeLikeRegions', () => {
  test('finds unfenced code by its line shapes', () => {
    const text = `Here is my code:\n${PYTHON_SNIPPET}\nWhy does it fail?`;
    const regions = findCodeLikeRegions(text);

    expect(regions).toHaveLength(1);
    expect(text.slice(regions[0].start, regions[0].end)).toBe(PYTHON_SNIPPET);
  });

  test('leaves prose alone', () => {
    expect(findCodeLikeRegions('My name is Ada Lovelace.\nI live in London.')).toEqual([]);
  });

  test('finds a type that only declares fields', () => {
    const dataclass = 'class Customer:\n    first_name: str\n    age: int = 0';
    expect(findCodeLikeRegions(`My model:\n${dataclass}`)).toEqual([{ start: 10, end: 10 + dataclass.length }]);
    const oneLine = 'public class Customer { public string FirstName { get; set; } }';
    expect(findCodeLikeRegions(oneLine)).toEqual([{ start: 0, end: oneLine.length }]);
  });

  test('a label line is not a field outside code', () => {
    expect(findCodeLikeRegions('Order details\n    Name: Anna Mueller\n    City: Berlin')).toEqual([]);
  });

  test('keeps a comment line inside the code run', () => {
    const text =
      'const modal = document.querySelector("dialog");\n\n// Feliratkozás a bezárás eseményre\nmodal.addEventListener("close", () => {\n    console.log("A modal bezárult.");\n});';
    expect(findCodeLikeRegions(text)).toEqual([{ start: 0, end: text.length }]);
  });

  test('finds several statements on one line', () => {
    const line = 'int count = 0; var total = count + 1;';
    expect(findCodeLikeRegions(line)).toEqual([{ start: 0, end: line.length }]);
  });

  test('leaves one line of prose with semicolons alone', () => {
    expect(findCodeLikeRegions('I paid 5; she paid 6;')).toEqual([]);
  });

  test('finds one unmistakable code line', () => {
    const line = 'public string? Description => (L.IsHu ? DescriptionHu : DescriptionEn) ?? DescriptionEn ?? DescriptionHu; }';
    expect(findCodeLikeRegions(line)).toEqual([{ start: 0, end: line.length }]);
  });

  test('leaves one line of prose with a keyword and semicolon alone', () => {
    expect(findCodeLikeRegions('if you can, return it by Friday;')).toEqual([]);
  });

  test('starts the region after prose that leads into code on the same line', () => {
    const text = 'A hiba, hogy nemtalálja a x_1-et pedig az Promise<void> | null = null; ként definiálva van. let x: number = 1;\nconst y = x;';
    const [region] = findCodeLikeRegions(text);
    expect(text.slice(region.start, region.end)).toBe('let x: number = 1;\nconst y = x;');
  });

  test('keeps code with a statement boundary before a keyword whole', () => {
    const line = 'x = 1; let y = 2;';
    expect(findCodeLikeRegions(line)).toEqual([{ start: 0, end: line.length }]);
  });

  test('still includes fenced blocks', () => {
    const text = 'see\n```\nhello\n```';
    expect(findCodeLikeRegions(text)).toEqual([{ start: 4, end: text.length }]);
  });
});

describe('buildIdentifierSplitView', () => {
  test('splits camelCase and snake_case identifiers in code only', () => {
    const text = `AdaLovelace says hi\n${PYTHON_SNIPPET}`;
    const view = buildIdentifierSplitView(text, findCodeLikeRegions(text));

    expect(view.text).toContain('AdaLovelace says hi');
    expect(view.text).toContain('def get Ada Lovelace Invoice(ada lovelace id):');
    expect(view.toOriginal).toHaveLength(view.text.length + 1);
  });

  test('keeps acronyms together', () => {
    const text = 'const parseHTTPResponse = 1;\nlet x = 2;';
    const view = buildIdentifierSplitView(text, findCodeLikeRegions(text));

    expect(view.text).toContain('parse HTTP Response');
  });
});

describe('mapViewSpansToOriginal', () => {
  test('maps a name found in the split view back onto the identifier', () => {
    const text = PYTHON_SNIPPET;
    const view = buildIdentifierSplitView(text, findCodeLikeRegions(text));

    const mapped = mapViewSpansToOriginal(
      [nerSpan(view.text, 'Ada Lovelace'), nerSpan(view.text, 'ada lovelace')],
      view,
      text,
    );

    expect(mapped.map((s) => s.text)).toEqual(['AdaLovelace', 'ada_lovelace']);
    for (const span of mapped) {
      expect(new TextDecoder().decode(new TextEncoder().encode(text).slice(span.start, span.end))).toBe(
        span.text,
      );
    }
  });
});

describe('propagateIdentifierSpans', () => {
  test('flags every occurrence of a flagged identifier word', () => {
    const text = PYTHON_SNIPPET;
    const regions = findCodeLikeRegions(text);

    const spans = propagateIdentifierSpans(text, regions, [nerSpan(text, 'ada_lovelace')]);

    expect(spans.map((s) => s.text)).toEqual(['ada_lovelace', 'ada_lovelace']);
    expect(new Set(spans.map((s) => s.start)).size).toBe(2);
  });

  test('does not flag the word inside a longer word', () => {
    const text = 'const annaFile = 1;\nconst annapolis = 2;';
    const spans = propagateIdentifierSpans(text, findCodeLikeRegions(text), [nerSpan(text, 'anna')]);

    expect(spans).toHaveLength(1);
  });
});

describe('code-safe replacement and restoration', () => {
  test('a name inside an identifier replaces it whole without brackets, strings keep them', () => {
    const text = [
      'def getAdaLovelaceInvoice():',
      '    print("Ada Lovelace")  # Ada Lovelace',
      '    return 1',
    ].join('\n');
    const spans = [
      nerSpan(text, 'AdaLovelace'),
      nerSpan(text, 'Ada Lovelace'),
      nerSpan(text, 'Ada Lovelace', text.indexOf('#')),
    ];
    spans[0] = { ...spans[0], entity_type: 'PERSON' };

    const { text: anonymized, entityMap } = anonymize(text, spans);

    expect(anonymized).toBe(
      [
        'def PERSON_1():',
        '    print("[PERSON_2]")  # [PERSON_2]',
        '    return 1',
      ].join('\n'),
    );
    expect(deAnonymize(anonymized, entityMap)).toBe(text);
  });

  test('a flagged part of a C# class name replaces the whole name', () => {
    const text = 'public class AnnaMuellerViewModel : ViewModelBase\n{\n    var vm = new AnnaMuellerViewModel();\n}';
    const { text: anonymized, entityMap } = anonymize(text, [nerSpan(text, 'AnnaMueller')]);

    expect(anonymized).toBe('public class PERSON_1 : ViewModelBase\n{\n    var vm = new PERSON_1();\n}');
    expect(deAnonymize(anonymized, entityMap)).toBe(text);
  });

  test('generic code words the model read as a name are dropped', () => {
    const text = 'public class UserDataViewModel\n{\n    public string CustomerName { get; set; }\n    var x = getAnnaMuellerInvoice();\n}';
    const regions = findCodeLikeRegions(text);
    const spans = [nerSpan(text, 'UserData'), nerSpan(text, 'CustomerName'), nerSpan(text, 'AnnaMueller')];

    expect(dropGenericIdentifierSpans(text, regions, spans).map((span) => span.text)).toEqual(['AnnaMueller']);
  });

  test('a generic word in prose stays the model\'s call', () => {
    const text = 'Please ask User about it.';
    const spans = [nerSpan(text, 'User')];

    expect(dropGenericIdentifierSpans(text, [], spans)).toEqual(spans);
  });

  test('a whole identifier in code becomes a bare placeholder', () => {
    const text = 'ada_lovelace = load()\nprint(ada_lovelace)';
    const regions = findCodeLikeRegions(text);
    const spans = propagateIdentifierSpans(text, regions, [nerSpan(text, 'ada_lovelace')]);

    const { text: anonymized, entityMap } = anonymize(text, spans);

    expect(anonymized).toBe('PERSON_1 = load()\nprint(PERSON_1)');
    expect(deAnonymize(anonymized, entityMap)).toBe(text);
  });

  test('restores placeholders the model reused in new identifiers', () => {
    const text = 'AdaLovelace = load()\nprint(AdaLovelace)';
    const { entityMap } = anonymize(text, [nerSpan(text, 'AdaLovelace')]);

    expect(deAnonymize('def setPERSON_1Invoice(): pass\nPERSON_1_total = 0', entityMap)).toBe(
      'def setAdaLovelaceInvoice(): pass\nAdaLovelace_total = 0',
    );
  });

  test('prose outside code keeps bracketed placeholders', () => {
    const text = 'Please email Ada Lovelace today.';
    const check = createIdentifierPositionCheck(text);
    const start = text.indexOf('Ada');

    expect(check(start, start + 'Ada Lovelace'.length)).toBe(false);
  });

  test('error output is prose, except for a name glued into an identifier and quoted source lines', () => {
    const text = [
      '```',
      'Traceback (most recent call last):',
      '  File "/home/ada/app.py", line 3, in getAdaLovelaceInvoice',
      '    total = load(ada_id)',
      "KeyError: 'Ada Lovelace'",
      '```',
    ].join('\n');
    const check = createIdentifierPositionCheck(text);
    const at = (needle: string, before = ''): [number, number] => {
      const start = text.indexOf(before + needle) + before.length;
      return [start, start + needle.length];
    };

    expect(check(...at('ada', '/home/'))).toBe(false);
    expect(check(...at('Ada Lovelace'))).toBe(false);
    expect(check(...at('AdaLovelace'))).toBe(true);
    expect(check(...at('ada_id'))).toBe(true);
  });
});
