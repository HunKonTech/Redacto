import {
  errorRegionCodeTexts,
  findErrorRegions,
  parseErrorSlots,
  subtractRegions,
  type ErrorSlot,
} from '../../src/shared/error-trace';

function regionTexts(text: string): string[] {
  return findErrorRegions(text).map((region) => text.slice(region.start, region.end));
}

function slotsOf(text: string): ErrorSlot[] {
  return parseErrorSlots(text, findErrorRegions(text));
}

/** `kind:name[:role][:lib]` for every slot, in text order. */
function describeSlots(text: string, kinds: ErrorSlot['kind'][] = ['qualified', 'quoted', 'file-stem']): string[] {
  return slotsOf(text)
    .filter((slot) => kinds.includes(slot.kind))
    .map((slot) => [slot.kind, slot.name, slot.role, slot.libraryFrame ? 'lib' : undefined].filter(Boolean).join(':'));
}

function echoes(text: string): string[] {
  return slotsOf(text)
    .filter((slot) => slot.kind === 'echo' && !slot.libraryFrame)
    .map((slot) => text.slice(slot.start, slot.end));
}

describe('Python', () => {
  const TRACE = `Traceback (most recent call last):
  File "/home/anna/acme/billing/app.py", line 12, in <module>
    main()
  File "/home/anna/acme/billing/invoice_service.py", line 8, in load_invoice
    return invoice.customerName
AttributeError: 'AcmeInvoice' object has no attribute 'customerName'`;

  test('the traceback is one region, prose around it is not', () => {
    expect(regionTexts(`I get this:\n\n${TRACE}\n\nAny idea?`)).toEqual([TRACE]);
  });

  test('frames, quoted names and file stems; source lines are echoes', () => {
    expect(describeSlots(TRACE)).toEqual([
      'file-stem:app',
      'file-stem:invoice_service',
      'qualified:load_invoice:function',
      'qualified:AttributeError:class',
      'quoted:AcmeInvoice',
      'quoted:customerName',
    ]);
    expect(echoes(TRACE)).toEqual(['main()', 'return invoice.customerName']);
  });

  test('library frames and their source lines are marked', () => {
    const trace = `Traceback (most recent call last):
  File "/app/venv/lib/python3.11/site-packages/requests/api.py", line 59, in request
    return session.request(method=method, url=url)
  File "<frozen importlib._bootstrap>", line 1, in _find_and_load
KeyError: 'invoice_id'`;

    expect(describeSlots(trace)).toEqual([
      'file-stem:api:lib',
      'qualified:request:function:lib',
      'qualified:_find_and_load:function:lib',
      'qualified:KeyError:class',
    ]);
    expect(echoes(trace)).toEqual([]);
  });

  test('chained tracebacks stay one region and a custom exception closes it', () => {
    const trace = `Traceback (most recent call last):
  File "app.py", line 3, in load_invoice
acme.errors.InvoiceNotFound: INV-1

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "app.py", line 9, in <module>
RuntimeError: failed`;

    expect(regionTexts(trace)).toEqual([trace]);
    expect(describeSlots(trace)).toContain('qualified:InvoiceNotFound:class');
  });
});

describe('Node / JavaScript / TypeScript', () => {
  const TRACE = `TypeError: Cannot read properties of undefined (reading 'customerName')
    at InvoiceService.loadInvoice (/app/src/InvoiceService.ts:42:13)
    at new InvoiceController (/app/src/controller.js:7:5)
    at async Promise.all (index 0)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)
    at Object.<anonymous> (/app/src/index.js:5:3)
    at /app/src/index.js:9:1`;

  test('frames with source-mapped paths; node_modules and built-ins are library', () => {
    expect(regionTexts(TRACE)).toEqual([TRACE]);
    expect(describeSlots(TRACE)).toEqual([
      'qualified:TypeError:class',
      'quoted:customerName',
      'qualified:InvoiceService:class',
      'qualified:loadInvoice:function',
      'file-stem:InvoiceService',
      'qualified:InvoiceController:class',
      'file-stem:controller',
      'qualified:Promise:class:lib',
      'qualified:all:function:lib',
      'qualified:Layer:class:lib',
      'qualified:handle:function:lib',
      'file-stem:layer:lib',
      'qualified:Object:function',
      'file-stem:index',
      'file-stem:index',
    ]);
  });

  test('the code frame above the error quotes the source line', () => {
    const trace = `/app/src/invoice.js:12
  return invoice.customerName.trim();
                              ^

TypeError: Cannot read properties of undefined (reading 'trim')
    at loadInvoice (/app/src/invoice.js:12:31)

Node.js v18.17.0`;

    expect(regionTexts(trace)).toEqual([trace]);
    expect(echoes(trace)).toEqual(['return invoice.customerName.trim();']);
  });
});

describe('.NET', () => {
  const TRACE = `Unhandled exception. System.NullReferenceException: Object reference not set to an instance of an object.
   at System.Linq.Enumerable.First[TSource](IEnumerable\`1 source)
   at Acme.Billing.InvoiceService.<LoadInvoiceAsync>d__4.MoveNext() in C:\\src\\Acme\\Billing\\InvoiceService.cs:line 31
--- End of stack trace from previous location ---
   at Acme.Billing.InvoiceService.LoadInvoice(Int32 id) in C:\\src\\Acme\\Billing\\InvoiceService.cs:line 42
   at Acme.Billing.Program.Main(String[] args)`;

  test('namespaces, class and method; System frames are library; parameters are mentions', () => {
    expect(regionTexts(TRACE)).toEqual([TRACE]);
    expect(describeSlots(TRACE).filter((slot) => !slot.endsWith(':lib'))).toEqual([
      'qualified:Acme:namespace',
      'qualified:Billing:namespace',
      'qualified:InvoiceService:class',
      'qualified:LoadInvoiceAsync:function',
      'file-stem:InvoiceService',
      'qualified:Acme:namespace',
      'qualified:Billing:namespace',
      'qualified:InvoiceService:class',
      'qualified:LoadInvoice:function',
      'quoted:Int32',
      'quoted:id',
      'file-stem:InvoiceService',
      'qualified:Acme:namespace',
      'qualified:Billing:namespace',
      'qualified:Program:class',
      'qualified:Main:function',
      'quoted:String',
      'quoted:args',
    ]);
    expect(describeSlots(TRACE).filter((slot) => slot.endsWith(':lib'))).toEqual([
      'qualified:System:namespace:lib',
      'qualified:NullReferenceException:class:lib',
      'qualified:System:namespace:lib',
      'qualified:Linq:namespace:lib',
      'qualified:Enumerable:class:lib',
      'qualified:First:function:lib',
    ]);
  });

  test('frames written as code for the identifier classifier', () => {
    expect(errorRegionCodeTexts(TRACE, findErrorRegions(TRACE))).toEqual([
      [
        'throw new System.NullReferenceException();',
        'System.Linq.Enumerable.First();',
        'Acme.Billing.InvoiceService.LoadInvoiceAsync();',
        'Acme.Billing.InvoiceService.LoadInvoice();',
        'Acme.Billing.Program.Main();',
      ].join('\n'),
    ]);
  });
});

describe('Java / Kotlin', () => {
  const TRACE = `Exception in thread "main" java.lang.IllegalStateException: Invoice not loaded
\tat com.acme.billing.InvoiceService.loadInvoice(InvoiceService.java:42)
\tat com.acme.billing.InvoiceService$Loader.lambda$run$0(InvoiceService.java:77)
\tat java.base/java.lang.Thread.run(Thread.java:833)
Caused by: com.acme.billing.InvoiceNotFoundException: INV-1
\tat com.acme.billing.InvoiceRepository.find(InvoiceRepository.kt:12)
\t... 3 more`;

  test('packages without the domain, classes, methods; the JDK is library', () => {
    expect(regionTexts(TRACE)).toEqual([TRACE]);
    expect(describeSlots(TRACE).filter((slot) => !slot.endsWith(':lib'))).toEqual([
      'qualified:acme:namespace',
      'qualified:billing:namespace',
      'qualified:InvoiceService:class',
      'qualified:loadInvoice:function',
      'file-stem:InvoiceService',
      'qualified:acme:namespace',
      'qualified:billing:namespace',
      'qualified:InvoiceService:class',
      'qualified:Loader:class',
      'qualified:run:function',
      'file-stem:InvoiceService',
      'qualified:acme:namespace',
      'qualified:billing:namespace',
      'qualified:InvoiceNotFoundException:class',
      'qualified:acme:namespace',
      'qualified:billing:namespace',
      'qualified:InvoiceRepository:class',
      'qualified:find:function',
      'file-stem:InvoiceRepository',
    ]);
    expect(describeSlots(TRACE)).toContain('qualified:Thread:class:lib');
  });

  test('kotlinc and javac diagnostics', () => {
    expect(describeSlots('e: file:///home/anna/acme/Main.kt:5:13 Unresolved reference: customerName')).toEqual([
      'file-stem:Main',
      'quoted:customerName',
    ]);
    const javac = `InvoiceService.java:42: error: cannot find symbol
        return invoice.customerName;
                      ^
  symbol:   variable customerName
  location: class InvoiceService`;
    expect(regionTexts(javac)).toEqual([javac]);
    expect(echoes(javac)).toEqual(['return invoice.customerName;']);
    expect(describeSlots(javac)).toEqual([
      'file-stem:InvoiceService',
      'quoted:customerName',
      'quoted:InvoiceService',
    ]);
  });
});

describe('compiler diagnostics', () => {
  test('tsc and C#', () => {
    const tsc = "src/invoice.ts(12,5): error TS2339: Property 'customerName' does not exist on type 'AcmeInvoice'.";
    expect(regionTexts(tsc)).toEqual([tsc]);
    expect(describeSlots(tsc)).toEqual(['file-stem:invoice', 'quoted:customerName', 'quoted:AcmeInvoice']);

    const csharp =
      "C:\\src\\Acme\\InvoiceService.cs(42,17): error CS0103: The name 'customerName' does not exist in the current context [C:\\src\\Acme\\Acme.csproj]";
    expect(describeSlots(csharp)).toEqual(['file-stem:InvoiceService', 'quoted:customerName']);
  });

  test('tsc --pretty quotes the source line', () => {
    const tsc = `src/invoice.ts:12:21 - error TS2339: Property 'customerName' does not exist on type 'AcmeInvoice'.

12   return invoice.customerName;
                    ~~~~~~~~~~~~`;
    expect(regionTexts(tsc)).toEqual([tsc]);
    expect(echoes(tsc)).toEqual(['return invoice.customerName;']);
  });

  test('gcc, go build and rustc', () => {
    const gcc = `main.c:12:5: error: 'customer_name' undeclared (first use in this function)
   12 |     customer_name = 1;
      |     ^~~~~~~~~~~~~`;
    expect(regionTexts(gcc)).toEqual([gcc]);
    expect(echoes(gcc)).toEqual(['customer_name = 1;']);

    expect(describeSlots('./main.go:12:5: undefined: customerName')).toEqual(['file-stem:main', 'quoted:customerName']);

    const rustc = `error[E0425]: cannot find value \`customer_name\` in this scope
 --> src/invoice.rs:5:13
  |
5 |     let x = customer_name;
  |             ^^^^^^^^^^^^^ help: a local variable with a similar name exists: \`customer_nme\``;
    expect(regionTexts(rustc)).toEqual([rustc]);
    expect(echoes(rustc)).toEqual(['let x = customer_name;']);
    expect(describeSlots(rustc)).toEqual(['quoted:customer_name', 'file-stem:invoice', 'quoted:customer_nme']);
  });
});

describe('Go', () => {
  test('panic with goroutine frames; the runtime is library', () => {
    const trace = `panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x47b5c2]

goroutine 1 [running]:
runtime.gopanic({0x4a5b20?, 0x5b7c30?})
\t/usr/local/go/src/runtime/panic.go:914 +0x21f
github.com/acme/billing.(*InvoiceService).LoadInvoice(0x0, 0x2a)
\t/home/anna/acme/billing/invoice.go:42 +0x22
main.main()
\t/home/anna/acme/billing/main.go:50 +0x1d
exit status 2`;

    expect(regionTexts(trace)).toEqual([trace.slice(0, trace.lastIndexOf('\nexit'))]);
    expect(describeSlots(trace)).toEqual([
      'qualified:runtime:namespace:lib',
      'qualified:gopanic:function:lib',
      'file-stem:panic:lib',
      'qualified:acme:namespace',
      'qualified:billing:namespace',
      'qualified:InvoiceService:class',
      'qualified:LoadInvoice:function',
      'file-stem:invoice',
      'qualified:main:namespace',
      'qualified:main:function',
      'file-stem:main',
    ]);
  });
});

describe('Rust', () => {
  test('panic with a backtrace; std frames are library', () => {
    const trace = `thread 'main' panicked at src/main.rs:5:10:
called \`Option::unwrap()\` on a \`None\` value
stack backtrace:
   0: rust_begin_unwind
             at /rustc/90b35a6239c3d8bdabc530a6a0816f7ff89a0aaf/library/std/src/panicking.rs:597:5
   1: core::panicking::panic
   2: billing::invoice::InvoiceService::load_invoice
             at ./src/invoice.rs:12:5
note: Some details are omitted, run with \`RUST_BACKTRACE=full\` for a verbose backtrace.`;

    expect(regionTexts(trace)).toEqual([trace]);
    expect(describeSlots(trace, ['qualified']).filter((slot) => !slot.endsWith(':lib'))).toEqual([
      'qualified:billing:namespace',
      'qualified:invoice:namespace',
      'qualified:InvoiceService:class',
      'qualified:load_invoice:function',
    ]);
  });
});

describe('not error output', () => {
  test.each([
    ['prose with an indented "at" phrase', 'We met\n  at home (usually)\nand talked.'],
    ['a TypeScript member ending in Error', 'interface State {\n  lastError: string;\n}'],
    ['code raising an exception', 'if (!invoice) {\n  throw new InvoiceNotFoundError(id);\n}'],
    ['Python code catching one', 'try:\n    load()\nexcept ValueError:\n    pass'],
    ['a colon heading', 'Output:\nnothing'],
  ])('%s', (_label, text) => {
    expect(findErrorRegions(text)).toEqual([]);
  });
});

test('subtractRegions cuts holes out of regions', () => {
  expect(subtractRegions([{ start: 0, end: 100 }], [{ start: 10, end: 20 }, { start: 90, end: 120 }])).toEqual([
    { start: 0, end: 10 },
    { start: 20, end: 90 },
  ]);
});
