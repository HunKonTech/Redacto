/**
 * Redacto — user-listed public domains
 *
 * Links to any site that is not on the pipeline's built-in public list are
 * treated as belonging to an organisation and replaced. Users add their own
 * public sites here; the list is passed to the WASM pipeline as
 * `public_domains`.
 */

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;

/**
 * Reduce user input (`https://www.Acme.hu/about`) to a bare domain
 * (`acme.hu`). Returns `null` when nothing domain-shaped is left.
 */
export function normalizeDomain(raw: string): string | null {
  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^[^@/]*@/, '')
    .replace(/[/?#:].*$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  return DOMAIN_RE.test(domain) ? domain : null;
}

/** Stored value → clean, de-duplicated domain list. */
export function normalizePublicDomains(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const domains = raw
    .filter((value): value is string => typeof value === 'string')
    .map(normalizeDomain)
    .filter((value): value is string => value !== null);
  return [...new Set(domains)];
}
