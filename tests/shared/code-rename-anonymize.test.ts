import ts from 'typescript';
import { anonymize, anonymizeWithVault, previewIdentifierRenames } from '../../src/shared/anonymizer';
import { buildConversationScope } from '../../src/shared/conversation-scope';
import { EntityMap } from '../../src/shared/entity-map';
import { emptyVaultData } from '../../src/shared/identity-vault';
import type { PiiSpan } from '../../src/shared/message-types';
import { resolveText } from '../../src/shared/placeholder-resolver';
import { stringIndexToByteOffset } from '../../src/shared/text-offsets';

const PYTHON = `class Alma:
    def __init__(self, nev):
        self.nev = nev

alma = Alma("piros")
print(alma.nev)`;

const TYPESCRIPT = `import { readFile } from 'fs/promises';

interface InvoiceRow { customerId: string; amount: number }

export async function loadInvoices(path: string): Promise<InvoiceRow[]> {
  const raw = await readFile(path, 'utf8');
  const rows = JSON.parse(raw) as InvoiceRow[];
  return rows.filter((row) => row.amount > 0);
}`;

const RENAME = { renameIdentifiers: true };

function personSpan(text: string, needle: string, from = 0): PiiSpan {
  const start = text.indexOf(needle, from);
  return {
    start: stringIndexToByteOffset(text, start),
    end: stringIndexToByteOffset(text, start + needle.length),
    entity_type: 'PERSON',
    score: 0.9,
    text: needle,
    source: 'ner',
  };
}

function syntaxErrors(code: string): string[] {
  const output = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return (output.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('anonymize with renameIdentifiers', () => {
  test('renames a class, its field and the instance consistently', () => {
    const { text, renamedIdentifiers } = anonymize(PYTHON, [], new EntityMap(), RENAME);

    expect(text).toBe(`class Class1:
    def __init__(self, field2):
        self.field2 = field2

var3 = Class1("piros")
print(var3.field2)`);
    expect(renamedIdentifiers).toBe(3);
  });

  test('restores the original names in a reply that reuses and extends the code', () => {
    const { text, entityMap } = anonymize(PYTHON, [], new EntityMap(), RENAME);
    expect(text).toContain('var3.field2');

    const reply = 'Add a method:\n```python\ndef leiras(var3: Class1) -> str:\n    return var3.field2.upper()\n```';
    expect(resolveText(reply, entityMap).deAnonText).toBe(
      'Add a method:\n```python\ndef leiras(alma: Alma) -> str:\n    return alma.nev.upper()\n```',
    );
  });

  test('round-trips exactly', () => {
    const { text, entityMap } = anonymize(TYPESCRIPT, [], new EntityMap(), RENAME);

    expect(text).not.toContain('InvoiceRow');
    expect(text).not.toContain('loadInvoices');
    expect(text).toContain("from 'fs/promises'");
    expect(text).toContain('readFile(');
    expect(resolveText(text, entityMap).deAnonText).toBe(TYPESCRIPT);
  });

  test('renamed TypeScript still parses', () => {
    const { text } = anonymize(TYPESCRIPT, [], new EntityMap(), RENAME);

    expect(syntaxErrors(text)).toEqual([]);
  });

  test('a name the model flagged keeps its typed placeholder instead of a neutral alias', () => {
    const code = 'function getAnnaMuellerInvoice(id) {\n  return load(id);\n}\nconst x1 = getAnnaMuellerInvoice(1);';
    const spans = [personSpan(code, 'AnnaMueller'), personSpan(code, 'AnnaMueller', 40)];

    const { text } = anonymize(code, spans, new EntityMap(), RENAME);

    expect(text).toBe('function getPERSON_1Invoice(param1) {\n  return func3(param1);\n}\nconst var2 = getPERSON_1Invoice(1);');
  });

  test('aliases never collide with names already in the code', () => {
    const code = 'const var1 = 1;\nconst alma = var1 + 1;';
    const { text } = anonymize(code, [], new EntityMap(), RENAME);

    expect(text).toBe('const var2 = 1;\nconst var3 = var2 + 1;');
  });

  test('prose leading into code on the same line keeps its words and uses the code\'s aliases', () => {
    const original = [
      'A hiba, hogy nemtalálja a offscreenReady_1-et pedig az Promise<void> | null = null; ként definiálva van. let offscreenReady: Promise<void> | null = null;',
      'const canceledDetectionIds = new Set<string>();',
      '',
      'function invalidateOffscreenReady(): void {',
      '  offscreenReady_1 = null;',
      '}',
    ].join('\n');
    const { text, entityMap } = anonymize(original, [], new EntityMap(), RENAME);

    expect(text).toBe(
      [
        'A hiba, hogy nemtalálja a var_4-et pedig az Promise<void> | null = null; ként definiálva van. let var1: Promise<void> | null = null;',
        'const var2 = new Set<string>();',
        '',
        'function func3(): void {',
        '  var_4 = null;',
        '}',
      ].join('\n'),
    );
    expect(resolveText(text, entityMap).deAnonText).toBe(original);
  });

  test('prose is left alone', () => {
    const prose = 'Anna said the alma = apple joke again.';
    expect(anonymize(prose, [], new EntityMap(), RENAME).text).toBe(prose);
  });
});

describe('anonymizeWithVault with renameIdentifiers', () => {
  test('stores aliases in the vault and reuses them in the next paste', () => {
    const vault = emptyVaultData();

    const first = anonymizeWithVault(PYTHON, [], vault, 'placeholder', new EntityMap(), RENAME);
    const second = anonymizeWithVault('alma = Alma("zold")\nalma.nev = 1\nalma.nev += 1', [], vault, 'placeholder', new EntityMap(), RENAME);

    expect(vault.records.filter((r) => r.entityType === 'IDENTIFIER').map((r) => [r.originalText, r.syntheticValue])).toEqual([
      ['Alma', 'Class1'],
      ['nev', 'field2'],
      ['alma', 'var3'],
    ]);
    expect(first.text).toContain('var3 = Class1("piros")');
    expect(second.text).toBe('var3 = Class1("zold")\nvar3.field2 = 1\nvar3.field2 += 1');
  });

  test('a conversation filed with the aliases resolves them after a reload', () => {
    const vault = emptyVaultData();
    const { text } = anonymizeWithVault(PYTHON, [], vault, 'placeholder', new EntityMap(), RENAME);

    // After a reload only the filed tokens and the vault remain.
    const scope = buildConversationScope({
      recordTokens: ['Class1', 'field2', 'var3'],
      recordOriginals: {},
      ledger: {},
      observed: [],
      vault,
      vaultEnabled: true,
    });

    expect(scope.resolve(text).deAnonText).toBe(PYTHON);
  });
});

describe('previewIdentifierRenames', () => {
  const apply = (text: string, renames: { start: number; end: number; alias: string }[]) => {
    let out = '';
    let cursor = 0;
    for (const r of renames) {
      out += text.slice(cursor, r.start) + r.alias;
      cursor = r.end;
    }
    return out + text.slice(cursor);
  };

  test('matches what anonymize pastes, without touching the EntityMap', () => {
    const entityMap = new EntityMap();
    const renames = previewIdentifierRenames(PYTHON, [], { entityMap });

    expect(apply(PYTHON, renames)).toBe(anonymize(PYTHON, [], new EntityMap(), RENAME).text);
    expect(entityMap.size).toBe(0);
  });

  test('matches what anonymizeWithVault pastes, without touching the vault', () => {
    const vaultData = emptyVaultData();
    const renames = previewIdentifierRenames(TYPESCRIPT, [], { vaultData });

    expect(apply(TYPESCRIPT, renames)).toBe(anonymizeWithVault(TYPESCRIPT, [], emptyVaultData(), 'placeholder', undefined, RENAME).text);
    expect(vaultData.records).toHaveLength(0);
  });

  test('renames generic names too', () => {
    const code = `def total(values, e):
    for i in range(len(values)):
        value = values[i]
        err = check(value)
    return value`;
    const text = apply(code, previewIdentifierRenames(code, []));

    expect(text).not.toMatch(/\b(?:values|value|err|e|i)\b/);
  });

  test('renames code pasted as one line', () => {
    const query = 'public const string ClientName = "github"; private readonly SiteOptions _opt = options;';

    expect(apply(query, previewIdentifierRenames(query, []))).toBe(
      'public const string Field1 = "github"; private readonly Class3 _field2 = var4;',
    );
  });

  test('renames names the code only uses, but not library names', () => {
    const line = 'public string? Description => (L.IsHu ? DescriptionHu : DescriptionEn) ?? DescriptionEn ?? DescriptionHu;\n}';

    expect(apply(line, previewIdentifierRenames(line, []))).toBe(
      'public string? Field1 => (Class2.Field3 ? Field4 : Field5) ?? Field5 ?? Field4;\n}',
    );
    const js = 'const total = Math.max(computeTotal(rows), 0);\nconsole.log(JSON.stringify(total));';
    expect(apply(js, previewIdentifierRenames(js, []))).toBe(
      'const var1 = Math.max(func2(var3), 0);\nconsole.log(JSON.stringify(var1));',
    );
  });
});

describe('renameIdentifiers in error output', () => {
  const PY_CODE = `def load_invoice(invoice_id):
    invoice = repo.get(invoice_id)
    return invoice.total`;
  const PY_TRACE = `Traceback (most recent call last):
  File "/srv/acme/billing/app.py", line 12, in load_invoice
    return invoice.total
AttributeError: 'NoneType' object has no attribute 'total'`;

  const roundTrips = (text: string) => {
    const entityMap = new EntityMap();
    const result = anonymize(text, [], entityMap, RENAME);
    expect(resolveText(result.text, entityMap).deAnonText).toBe(text);
    return result.text;
  };

  test.each([
    ['fenced', `${PY_CODE}\n\n\`\`\`\n${PY_TRACE}\n\`\`\``],
    ['unfenced', `${PY_CODE}\n\n${PY_TRACE}`],
  ])('a %s Python traceback uses the code\'s aliases and keeps its prose', (_label, text) => {
    const out = roundTrips(text);

    expect(out).toContain('def func_1(param_2):');
    expect(out).toContain('line 12, in func_1\n    return var3.total');
    expect(out).toContain('Traceback (most recent call last):');
    expect(out).toContain("AttributeError: 'NoneType' object has no attribute 'total'");
  });

  test('a .NET stack trace on its own renames its own frames and file names', () => {
    const trace = `Unhandled exception. System.NullReferenceException: Object reference not set to an instance of an object.
   at Acme.Billing.InvoiceService.LoadInvoice(Int32 id) in C:\\src\\Acme\\Billing\\InvoiceService.cs:line 42
   at Acme.Billing.Program.Main(String[] args) in C:\\src\\Acme\\Billing\\Program.cs:line 10`;

    expect(roundTrips(trace)).toBe(`Unhandled exception. System.NullReferenceException: Object reference not set to an instance of an object.
   at Ns1.Ns2.Class3.Func4(Int32 id) in C:\\src\\Acme\\Billing\\Class3.cs:line 42
   at Ns1.Ns2.Class5.Main(String[] args) in C:\\src\\Acme\\Billing\\Class5.cs:line 10`);
  });

  test('a Java stack trace keeps the domain and the JDK', () => {
    const trace = `Exception in thread "main" java.lang.NullPointerException
\tat com.acme.billing.InvoiceService.loadInvoice(InvoiceService.java:42)
\tat java.base/java.lang.Thread.run(Thread.java:833)`;

    expect(roundTrips(trace)).toBe(`Exception in thread "main" java.lang.NullPointerException
\tat com.ns1.ns2.Class3.func4(Class3.java:42)
\tat java.base/java.lang.Thread.run(Thread.java:833)`);
  });

  test('a Node stack trace leaves node_modules frames alone', () => {
    const trace = `TypeError: Cannot read properties of undefined (reading 'total')
    at InvoiceService.loadInvoice (/app/src/InvoiceService.ts:42:13)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)`;

    expect(roundTrips(trace)).toBe(`TypeError: Cannot read properties of undefined (reading 'total')
    at Class1.func2 (/app/src/Class1.ts:42:13)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)`);
  });

  test('names a diagnostic quotes get the code\'s aliases', () => {
    const text = `interface AcmeInvoice { customerName: string }
const invoice: AcmeInvoice = load();

src/invoice.ts(12,5): error TS2339: Property 'customerName' does not exist on type 'AcmeInvoice'.`;

    expect(roundTrips(text)).toBe(`interface Class1 { field2: string }
const var3: Class1 = func4();

src/invoice.ts(12,5): error TS2339: Property 'field2' does not exist on type 'Class1'.`);
  });

  test('a quoted name the paste does not rename stays', () => {
    const tsc = "src/invoice.ts(12,5): error TS2339: Property 'customerName' does not exist on type 'AcmeInvoice'.";
    expect(roundTrips(tsc)).toBe(tsc);
  });

  test('an exception type under the frames\' own namespace is renamed with them', () => {
    const trace = `Acme.Billing.InvoiceNotFoundException: Invoice 'INV-1' was not found.
   at Acme.Billing.InvoiceService.LoadInvoice(Int32 id)`;

    expect(roundTrips(trace)).toBe(`Ns1.Ns2.Class5: Invoice 'INV-1' was not found.
   at Ns1.Ns2.Class3.Func4(Int32 id)`);
  });

  test('the vault gives a trace the aliases of an earlier paste', () => {
    const vault = emptyVaultData();
    const code = 'public class InvoiceService {\n    public Invoice LoadInvoice(int id) { return null; }\n}';
    anonymizeWithVault(code, [], vault, 'placeholder', new EntityMap(), RENAME);
    const trace = `System.NullReferenceException: Object reference not set to an instance of an object.
   at Acme.Billing.InvoiceService.LoadInvoice(Int32 id) in /src/InvoiceService.cs:line 3`;

    const entityMap = new EntityMap();
    const { text } = anonymizeWithVault(trace, [], vault, 'placeholder', entityMap, RENAME);

    expect(text).toBe(`System.NullReferenceException: Object reference not set to an instance of an object.
   at Ns5.Ns6.Class1.Func2(Int32 param3) in /src/Class1.cs:line 3`);
    expect(resolveText(text, entityMap).deAnonText).toBe(trace);
  });
});
