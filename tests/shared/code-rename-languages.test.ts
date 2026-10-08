import { planIdentifierRenames } from '../../src/shared/code-rename';

/**
 * Official names of the fifty known languages and of the generated library
 * profiles stay; the user's own names are renamed.
 */

function plan(code: string, label?: string) {
  const text = label ? `\`\`\`${label}\n${code}\n\`\`\`` : code;
  return planIdentifierRenames(text, label ? {} : { regions: [{ start: 0, end: text.length }] });
}

function expectRenaming(code: string, kept: string[], own: string[], label?: string): void {
  const names = new Set(plan(code, label).occurrences.map((occurrence) => occurrence.name));
  for (const name of kept) expect({ name, renamed: names.has(name) }).toEqual({ name, renamed: false });
  for (const name of own) expect({ name, renamed: names.has(name) }).toEqual({ name, renamed: true });
}

describe('languages beyond the C family', () => {
  test('SQL: keywords in any case stay, tables and columns are renamed', () => {
    expectRenaming(
      'SELECT c.email, COUNT(o.id)\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE c.active = 1\nGROUP BY c.email;',
      ['SELECT', 'COUNT', 'FROM', 'JOIN', 'ON', 'WHERE', 'GROUP', 'BY'],
      ['email', 'customers', 'orders', 'customer_id', 'active'],
    );
  });

  test('Lua: `local` and the standard functions stay', () => {
    expectRenaming('local function greet(name)\n  print("Hello " .. name)\nend\n\nfor i, v in ipairs(invoices) do\n  greet(v)\nend', ['local', 'print', 'ipairs'], ['greet', 'invoices']);
  });

  test('shells: commands, flags and cmdlets stay, variables are renamed', () => {
    expectRenaming('#!/usr/bin/env bash\nset -euo pipefail\nfor f in "$BACKUP_DIR"/*.tar; do\n  echo "$f"\ndone', ['set', 'euo', 'pipefail', 'echo', 'done'], ['$BACKUP_DIR']);
    expectRenaming('param([string]$CustomerPath)\n$files = Get-ChildItem -Path $CustomerPath -Recurse\nWrite-Host $files.Count', ['Get', 'ChildItem', 'Recurse', 'Write', 'Host'], ['$CustomerPath', '$files']);
  });

  test('PHP: `$this` stays, a property is renamed as `$name` and `$this->name`', () => {
    const code = '<?php\nclass InvoiceMailer {\n    private $customerEmail;\n    public function send() { return $this->customerEmail; }\n}';
    expectRenaming(code, ['php', '$this'], ['InvoiceMailer', '$customerEmail', 'customerEmail', 'send']);
  });

  test('declarations the generic analysis would misread stay in other languages', () => {
    expectRenaming('let rec fact n = if n <= 1 then 1 else n * fact (n - 1)', ['rec'], ['fact'], 'ocaml');
    expectRenaming('section .text\nglobal _start\n_start:\n    mov eax, 1\n    xor ebx, ebx', ['mov', 'eax', 'ebx', 'section'], [], 'asm');
  });

  test('VB.NET keywords stay whatever their case', () => {
    expectRenaming('Module Billing\n    Sub Main()\n        Dim invoiceTotal As Decimal = 0\n    End Sub\nEnd Module', ['Module', 'Sub', 'Dim', 'As', 'End'], ['Billing', 'invoiceTotal'], 'vb');
  });

  test('string interpolation follows the renamed variables', () => {
    const kotlin = plan('fun greet(customerName: String) {\n    println("Hello $customerName, ${customerName.length}")\n}', 'kotlin');
    expect(kotlin.occurrences.filter((occurrence) => occurrence.name === 'customerName')).toHaveLength(3);
    const php = plan('<?php\nfunction mail_to($customerEmail) {\n    echo "Sending to $customerEmail";\n}');
    expect(php.occurrences.filter((occurrence) => occurrence.name === '$customerEmail')).toHaveLength(2);
    // JavaScript does not interpolate `"$x"`.
    const js = plan('const customerName = "x";\nconst label = "$customerName";');
    expect(js.occurrences.filter((occurrence) => occurrence.name === 'customerName')).toHaveLength(1);
  });

  test('Kotlin: stdlib functions and extensions stay', () => {
    expectRenaming('fun report(orders: List<Order>) {\n    val paid = orders.filter { it.isPaid }.map { o -> o.total }\n    println(listOf(paid))\n}', ['filter', 'map', 'println', 'listOf'], ['report', 'orders', 'Order', 'paid', 'total']);
  });

  test('Java: JRE types and stream methods stay', () => {
    expectRenaming(
      'import java.util.stream.Collectors;\n\npublic class Report {\n    List<Invoice> paid() {\n        return invoices.stream().filter(i -> i.isPaid()).collect(Collectors.toList());\n    }\n}',
      ['stream', 'filter', 'collect', 'Collectors', 'toList', 'List'],
      ['Report', 'Invoice', 'paid', 'invoices', 'isPaid'],
    );
  });

  test('Go: packages as receivers and common methods stay', () => {
    expectRenaming('package main\n\nfunc sync(urls []string) {\n    for _, u := range urls {\n        resp, _ := http.Get(u)\n        fmt.Println(resp.StatusCode)\n    }\n    group.Wait()\n}', ['http', 'Get', 'fmt', 'Println', 'StatusCode', 'Wait', 'range'], ['urls', 'group']);
  });

  test('Ruby: Kernel methods and Enumerable stay', () => {
    expectRenaming("require 'json'\n\ninvoices.each do |invoice|\n  puts invoice.customer_name\nend", ['require', 'each', 'puts'], ['invoices', 'customer_name']);
  });

  test('C#: BCL types and attributes stay', () => {
    expectRenaming(
      'using System.ComponentModel.DataAnnotations;\n\npublic class SignupForm\n{\n    [Required]\n    public string Email { get; set; }\n    public string ToJson() => JsonSerializer.Serialize(this);\n}',
      ['Required', 'JsonSerializer', 'Serialize'],
      ['SignupForm', 'Email', 'ToJson'],
    );
  });
});

describe('generated library profiles', () => {
  test('ASP.NET Core', () => {
    expectRenaming(
      'using Microsoft.AspNetCore.Mvc;\n\n[ApiController]\npublic class InvoicesController : ControllerBase\n{\n    [HttpGet("{id}")]\n    public IActionResult Get(int id) => invoice is null ? NotFound() : Ok(invoiceMapper.ToDto(id));\n}',
      ['ControllerBase', 'IActionResult', 'NotFound', 'Ok'],
      ['InvoicesController', 'invoiceMapper', 'ToDto'],
    );
    expectRenaming('var builder = WebApplication.CreateBuilder(args);\nbuilder.Services.AddScoped<IInvoiceStore, SqlInvoiceStore>();', ['WebApplication', 'Services', 'AddScoped'], ['IInvoiceStore', 'SqlInvoiceStore']);
  });

  test('EF Core', () => {
    expectRenaming('public async Task<List<Order>> Recent() => await db.Orders.Include(o => o.Customer).ToListAsync();\npublic DbSet<Order> Orders { get; set; }', ['Include', 'ToListAsync', 'DbSet'], ['Recent', 'Order', 'db', 'Customer']);
  });

  test('Spring and JUnit', () => {
    expectRenaming('@RestController\npublic class InvoiceApi {\n    @GetMapping("/{id}")\n    public ResponseEntity<Invoice> get(@PathVariable Long id) {\n        return ResponseEntity.ok(invoiceRepository.findById(id).orElseThrow());\n    }\n}', ['ResponseEntity', 'findById', 'orElseThrow'], ['InvoiceApi', 'Invoice', 'invoiceRepository']);
    expectRenaming('@Test\nvoid adds() {\n    assertEquals(3, calculator.add(1, 2));\n    verify(auditLog).record(any());\n}', ['assertEquals', 'verify', 'any'], ['adds', 'calculator', 'auditLog']);
  });

  test('Django: managers, querysets and field options stay', () => {
    expectRenaming(
      'from django.db import models\n\nclass Invoice(models.Model):\n    invoice_no = models.CharField(max_length=20, unique=True)\n\ndef open_invoices():\n    return Invoice.objects.filter(is_paid=False).select_related("customer")',
      ['models', 'CharField', 'max_length', 'unique', 'objects', 'filter', 'select_related'],
      ['Invoice', 'invoice_no', 'open_invoices', 'is_paid'],
    );
  });

  test('Angular, Vue and RxJS', () => {
    expectRenaming("import { Component } from '@angular/core';\n\n@Component({ selector: 'app-invoices', templateUrl: './invoices.html' })\nexport class InvoiceListComponent {\n  rows = inject(InvoiceStore).rows();\n}", ['selector', 'templateUrl', 'inject'], ['InvoiceListComponent', 'InvoiceStore']);
    expectRenaming("import { ref, computed } from 'vue';\nconst invoiceCount = ref(0);\nconst label = computed(() => formatInvoices(invoiceCount.value));", ['ref', 'computed', 'value'], ['invoiceCount', 'label', 'formatInvoices']);
    expectRenaming("import { map } from 'rxjs';\nconst totals$ = invoices$.pipe(debounceTime(300), map((rows) => sumInvoices(rows)));", ['pipe', 'debounceTime', 'map'], ['invoices$', 'sumInvoices']);
  });
});
