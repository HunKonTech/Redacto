import { syntheticLink, syntheticPath, type LinkStandIns } from '../../src/shared/synthetic-link';
import { deAnonymizeWithVault } from '../../src/shared/de-anonymizer';
import { emptyVaultData, upsertEntity } from '../../src/shared/identity-vault';
import type { PiiSpan } from '../../src/shared/message-types';

const standIns: LinkStandIns = { index: 0, username: 'casey_dev', ip: '192.0.2.10' };

describe('syntheticLink', () => {
  test('keeps scheme, service labels, path words and ticket shape on internal hosts', () => {
    const out = syntheticLink('https://jira.acme.corp/browse/PAY-1234', standIns);
    expect(out).toMatch(/^https:\/\/jira\.example\.corp\/browse\/[A-Z]{3}-\d{4}$/);
    expect(out).not.toContain('PAY-1234');
  });

  test('replaces IP hosts and credentials but keeps the port and database path', () => {
    expect(syntheticLink('http://10.0.0.12/admin', standIns)).toBe('http://192.0.2.10/admin');
    const out = syntheticLink('postgres://admin:s3cretPw@db.acme.com:5432/app', standIns);
    expect(out).toMatch(/^postgres:\/\/casey_dev:[a-z]\d[a-z]{4}[A-Z][a-z]@db\.example\.com:5432\/app$/);
  });

  test('keeps query keys and replaces token values with the same shape', () => {
    const out = syntheticLink('https://api.acme.io/v1/items?access_token=abc123&lang=en', standIns);
    expect(out).toMatch(/^https:\/\/api\.example\.com\/v1\/items\?access_token=[a-f]{3}\d{3}&lang=en$/);
    expect(out).not.toContain('abc123');
  });

  test('keeps a well-known document host and swaps the document ID', () => {
    const id = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const out = syntheticLink(`https://docs.google.com/document/d/${id}/edit`, standIns);
    expect(out).toMatch(/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9]{44}\/edit$/);
    expect(out).not.toContain(id);
  });

  test('replaces the tenant, profile handle and encoded email', () => {
    expect(syntheticLink('https://acme.sharepoint.com/sites/HR', standIns)).not.toMatch(/acme|HR/);
    expect(syntheticLink('https://www.linkedin.com/in/anna-kovacs-123/', standIns))
      .toBe('https://www.linkedin.com/in/casey_dev/');
    expect(syntheticLink('https://medium.com/@annak/post', standIns))
      .toBe('https://medium.com/@casey_dev/post');
    expect(syntheticLink('https://crm.acme.com/contacts/anna.kovacs%40acme.hu', standIns))
      .toBe('https://crm.example.com/contacts/casey_dev%40example.com');
  });

  test('file URLs follow path rules', () => {
    expect(syntheticLink('file:///C:/Users/mmueller/notes.txt', standIns))
      .toBe('file:///C:/Users/casey_dev/notes.txt');
  });

  test('is deterministic per original and index', () => {
    const url = 'https://acme.atlassian.net/wiki/spaces/FIN/pages/123456789';
    expect(syntheticLink(url, standIns)).toBe(syntheticLink(url, standIns));
    expect(syntheticLink(url, { ...standIns, index: 1 })).not.toBe(syntheticLink(url, standIns));
  });
});

describe('syntheticPath', () => {
  test('swaps the account and keeps the rest of a home path', () => {
    expect(syntheticPath('/Users/jdoe/project/app.py', standIns)).toBe('/Users/casey_dev/project/app.py');
    expect(syntheticPath('/mnt/c/Users/bob/Desktop', standIns)).toBe('/mnt/c/Users/casey_dev/Desktop');
    expect(syntheticPath('C:\\\\Users\\\\mmueller\\\\AppData', standIns))
      .toBe('C:\\\\Users\\\\casey_dev\\\\AppData');
  });

  test('replaces client and project names but keeps folders and extensions', () => {
    const out = syntheticPath('C:\\Users\\Anna Kovacs\\Documents\\Acme Contracts\\report.xlsx', standIns);
    expect(out).toMatch(/^C:\\Users\\casey_dev\\Documents\\[A-Z][a-z]+ Contracts\\report\.xlsx$/);
  });

  test('renames the server of a network share', () => {
    const out = syntheticPath('\\\\fileserver\\hr\\salaries.xlsx', standIns);
    expect(out).toMatch(/^\\\\fs01\\[a-z]+\\[a-z]+\.xlsx$/);
  });

  test('keeps UUID shape', () => {
    const out = syntheticPath('/var/data/exports/7f3c2a1e-9b4d-4c3e-8a2f-1d2e3f4a5b6c.csv', standIns);
    expect(out).toMatch(/^\/var\/data\/exports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/);
    expect(out).not.toContain('7f3c2a1e');
  });
});

describe('round trip through the vault', () => {
  function span(entityType: PiiSpan['entity_type'], text: string): PiiSpan {
    return { start: 0, end: text.length, entity_type: entityType, score: 0.9, text, source: 'regex' };
  }

  test('a synthetic link and path in a response restore to the originals', () => {
    const vault = emptyVaultData();
    const url = upsertEntity(vault, span('URL', 'https://wiki.acme.internal/HR/Onboarding'), 1, 'synthetic').record;
    const path = upsertEntity(vault, span('FILE_PATH', '/home/anna/exports/q3.csv'), 1, 'synthetic').record;
    expect(url.replacementMode).toBe('synthetic');
    expect(path.syntheticValue).toMatch(/^\/home\/[a-z_0-9]+\/exports\/[a-z]\d\.csv$/);

    const response = `Open ${url.syntheticValue} and load ${path.syntheticValue}.`;
    expect(deAnonymizeWithVault(response, vault))
      .toBe('Open https://wiki.acme.internal/HR/Onboarding and load /home/anna/exports/q3.csv.');
  });
});
