import { planIdentifierRenames } from '../../src/shared/code-rename';

/**
 * Official library names stay; the user's own names are renamed
 * (docs/plans/language-aware-identifiers.md).
 */

function renamed(code: string): Set<string> {
  const plan = planIdentifierRenames(code, { regions: [{ start: 0, end: code.length }] });
  return new Set(plan.occurrences.map((occurrence) => occurrence.name));
}

function expectRenaming(code: string, kept: string[], own: string[]): void {
  const names = renamed(code);
  for (const name of kept) expect({ name, renamed: names.has(name) }).toEqual({ name, renamed: false });
  for (const name of own) expect({ name, renamed: names.has(name) }).toEqual({ name, renamed: true });
}

describe('library samples', () => {
  test('jQuery: the reproduction from the plan', () => {
    const code = `function initCart(root: JQuery<HTMLElement>): void {
  const items = $('.cart-item');
  $(document).ready(() => { items.addClass('active'); });
  jQuery.ajax({ url: '/api' });
  $.each(items, (i, el) => {});
}`;
    expectRenaming(code, ['JQuery', 'HTMLElement', '$', 'document', 'ready', 'addClass', 'jQuery', 'ajax', 'url', 'each'], ['initCart', 'root', 'items']);
  });

  test('React with imports', () => {
    const code = `import { useState, useEffect } from 'react';

export function InvoiceList({ customerId }: { customerId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  useEffect(() => {
    fetchInvoices(customerId).then(setInvoices);
  }, [customerId]);
  return invoices.map((invoice) => invoice.total);
}`;
    expectRenaming(code, ['useState', 'useEffect', 'then', 'map'], ['InvoiceList', 'customerId', 'invoices', 'setInvoices', 'Invoice', 'fetchInvoices', 'total']);
  });

  test('React without imports', () => {
    const code = `function Counter() {
  const [count, setCount] = React.useState(0);
  const panel = useRef(null);
  useEffect(() => setCount(loadCount()), []);
  return count;
}`;
    expectRenaming(code, ['React', 'useState', 'useRef', 'useEffect'], ['Counter', 'count', 'setCount', 'panel', 'loadCount']);
  });

  test('Lodash', () => {
    const code = `const grouped = _.groupBy(orders, 'customerId');
const totals = _.mapValues(grouped, (items) => _.sumBy(items, 'amount'));
const unique = _.uniq(customerIds);`;
    expectRenaming(code, ['_', 'groupBy', 'mapValues', 'sumBy', 'uniq'], ['grouped', 'totals', 'orders', 'items', 'unique', 'customerIds']);
  });

  test('pandas: methods and keyword arguments of library calls stay', () => {
    const code = `import pandas as pd

def monthly_revenue(path):
    df = pd.read_csv(path, parse_dates=['created_at'])
    summary = df.groupby('region', as_index=False).agg({'amount': 'sum'})
    return summary.sort_values(by='amount', ascending=False)`;
    expectRenaming(code, ['pd', 'read_csv', 'parse_dates', 'groupby', 'as_index', 'agg', 'sort_values', 'by', 'ascending'], ['monthly_revenue', 'path', 'df', 'summary']);
  });

  test('LINQ: operators stay, the fields read through the lambda are renamed', () => {
    const code = `using System.Linq;

public decimal TotalForCustomer(int customerId)
{
    return _orders
        .Where(o => o.CustomerId == customerId && o.IsPaid)
        .Select(o => o.Amount)
        .DefaultIfEmpty(0)
        .Sum();
}`;
    expectRenaming(code, ['Where', 'Select', 'DefaultIfEmpty', 'Sum'], ['TotalForCustomer', 'customerId', '_orders', 'CustomerId', 'IsPaid', 'Amount']);
  });

  test('requests: keyword arguments and response members', () => {
    const code = `import requests

def load_customer(customer_id):
    response = requests.get(f"/customers/{customer_id}", timeout=5, headers=auth_headers())
    response.raise_for_status()
    return response.json()`;
    expectRenaming(code, ['requests', 'get', 'timeout', 'headers', 'raise_for_status', 'json'], ['load_customer', 'customer_id', 'response', 'auth_headers']);
  });
});

describe('decision rules', () => {
  test("the user's own declaration wins over a library name", () => {
    const code = `const url = buildUrl();
$.ajax({ url: url });`;
    expectRenaming(code, ['$', 'ajax'], ['url', 'buildUrl']);
  });

  test('member names are kept only after a library receiver, not on their own', () => {
    const code = `$('#cart').addClass('open');
addClass(cart);
each(cart);`;
    expectRenaming(code, ['$'], ['addClass', 'each', 'cart']);
  });

  test('members of a library value stay even when the user declares the same name', () => {
    const code = `function hide(panel) { panel.hidden = true; }
const items = $('.item');
items.hide();`;
    const plan = planIdentifierRenames(code, { regions: [{ start: 0, end: code.length }] });
    expect(plan.roles.get('hide')).toBe('function');
    expect(plan.occurrences.filter((occurrence) => occurrence.name === 'hide')).toHaveLength(1);
  });

  test('option keys stay only for library calls, and only on the options object itself', () => {
    expectRenaming("const reply = await fetch(endpoint, { method: 'POST' });", ['fetch', 'method'], ['endpoint']);
    expectRenaming("import { send } from './api';\nconst reply = await send(endpoint, { method: 'POST' });", ['send'], ['method', 'endpoint']);
    expectRenaming("jQuery.ajax({ url: target, data: { cache: kind } });", ['url', 'data'], ['cache', 'target', 'kind']);
  });

  test('Python built-ins are not library names in code that cannot be Python', () => {
    expectRenaming('invoiceService.loadInvoice(id);', [], ['id']);
    expectRenaming('def show(invoice):\n    print(id(invoice))\n', ['id', 'print'], ['show', 'invoice']);
  });

  test("built-ins Python shares with other languages stay in them", () => {
    const go = 'package main\n\nfunc total(items []int) int {\n    sum := 0\n    for _, v := range items {\n        sum += v\n    }\n    buf := bytes.NewBuffer(nil)\n    return len(items) + sum + buf.Len()\n}';
    expectRenaming(go, ['range', 'len', 'bytes'], ['total', 'items', 'sum', 'buf']);
  });

  test('a language lexicon only applies to its own language', () => {
    // `DOMParser` is a DOM class in TypeScript, the user's own class in Python.
    expectRenaming('function mount(el: DOMParser): void {}', ['DOMParser'], ['mount', 'el']);
    expectRenaming('def mount(el):\n    return DOMParser(el)\n', [], ['DOMParser']);
  });

  test('a library module is kept as a receiver only', () => {
    expectRenaming("import os\nconfig_dir = os.path.join(home, 'cfg')", ['os', 'join'], ['config_dir', 'home']);
    expectRenaming('def run():\n    grid = np.zeros(size)\n    return grid\n', ['np', 'zeros'], ['grid', 'size']);
    // Used on its own it is a plain name.
    expectRenaming('def run():\n    log(np)\n', [], ['np']);
  });
});

describe('languages and profiles on the plan', () => {
  test('each region gets its language; profiles cover the whole paste', () => {
    const text = '```ts\nconst panel = $(selector).hide();\n```\n\n```python\ndef load(path):\n    return path\n```';
    const plan = planIdentifierRenames(text);

    expect(plan.languages).toEqual(['typescript', 'python']);
    expect(plan.profiles).toEqual(['jquery']);
  });
});
