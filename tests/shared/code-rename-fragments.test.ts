import { planIdentifierRenames } from '../../src/shared/code-rename';

/**
 * One- to three-line fragments (docs/plans/language-aware-identifiers.md,
 * "Kódtöredékek"): too short for a reliable language, so library profiles
 * activate from their own shapes, and an unclear language falls back to the
 * language-independent names. Each fragment is analysed as one code region —
 * finding code in prose is `findCodeLikeRegions`'s job, not tested here.
 */

function plan(fragment: string) {
  return planIdentifierRenames(fragment, { regions: [{ start: 0, end: fragment.length }] });
}

/** Names whose occurrences are renamed (declared, used, or members of own receivers). */
function renamed(fragment: string): Set<string> {
  return new Set(plan(fragment).occurrences.map((occurrence) => occurrence.name));
}

const FRAGMENTS: Array<[fragment: string, kept: string[], renamed: string[]]> = [
  ["$('.cart-item').addClass('active');", ['$', 'addClass'], []],
  ['const items = $(sel); items.hide();', ['$', 'hide'], ['items', 'sel']],
  ['jQuery.ajax({ url: apiUrl });', ['jQuery', 'ajax', 'url'], ['apiUrl']],
  ['function f(el: JQuery<HTMLElement>) {}', ['JQuery', 'HTMLElement'], ['f', 'el']],
  // `o.sum` is the user's field: `o` iterates the user's own `orders`.
  ['$.each(orders, (i, o) => total += o.sum);', ['$', 'each'], ['orders', 'total', 'sum']],
  ['const [n, setN] = useState(0);', ['useState'], ['n', 'setN']],
  ["_.map(users, 'email')", ['_', 'map'], ['users']],
  ["df.groupby('city').mean()", ['groupby', 'mean'], ['df']],
  ['customers.Where(c => c.IsActive).ToList();', ['Where', 'ToList'], ['customers', 'IsActive']],
  ['invoiceService.loadInvoice(id);', [], ['invoiceService', 'loadInvoice', 'id']],
];

describe('code fragments', () => {
  test.each(FRAGMENTS)('%s', (fragment, kept, expected) => {
    const names = renamed(fragment);
    for (const name of kept) expect(names).not.toContain(name);
    for (const name of expected) expect(names).toContain(name);
  });

  test('profiles activate from fragment shapes alone', () => {
    expect(plan("$('.cart-item').addClass('active');").profiles).toContain('jquery');
    expect(plan('const [n, setN] = useState(0);').profiles).toContain('react');
    expect(plan("_.map(users, 'email')").profiles).toContain('lodash');
    expect(plan("df.groupby('city').mean()").profiles).toContain('pandas');
    expect(plan('customers.Where(c => c.IsActive).ToList();').profiles).toContain('linq');
    expect(plan('invoiceService.loadInvoice(id);').profiles).toEqual([]);
  });

  test('an unclear fragment is `unknown`, not a guess', () => {
    for (const fragment of ["$('.cart-item').addClass('active');", 'invoiceService.loadInvoice(id);', "df.groupby('city').mean()"]) {
      expect(plan(fragment).languages).toEqual(['unknown']);
    }
  });

  test('LIB preservation and OWN renaming across the set', () => {
    let keptTotal = 0;
    let keptOk = 0;
    let ownTotal = 0;
    let ownOk = 0;
    for (const [fragment, kept, expected] of FRAGMENTS) {
      const names = renamed(fragment);
      keptTotal += kept.length;
      keptOk += kept.filter((name) => !names.has(name)).length;
      ownTotal += expected.length;
      ownOk += expected.filter((name) => names.has(name)).length;
    }
    expect(keptOk / keptTotal).toBe(1);
    expect(ownOk / ownTotal).toBe(1);
  });
});
