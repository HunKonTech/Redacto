/**
 * Redacto — Synthetic links and filesystem paths
 *
 * Builds a stand-in for a private URL or path that keeps its shape: scheme,
 * port, path depth, separators, file extensions and query keys survive, so
 * the downstream model still reads it as a working link or path. Everything
 * that could identify someone — hosts, account names, identifiers,
 * credentials, project or client names — is swapped for a neutral value.
 *
 * Output is deterministic for a given `(original, index)` pair.
 */

/** Values the pool has already picked for this record. */
export interface LinkStandIns {
  /** Zero-based vault counter for the entity type. */
  index: number;
  username: string;
  ip: string;
}

/** Path and URL words that describe structure, not a person or a client. */
const COMMON_WORDS: ReadonlySet<string> = new Set([
  'about', 'account', 'accounts', 'admin', 'analytics', 'answers', 'api', 'app', 'appdata',
  'apple', 'application', 'apps', 'archive', 'article', 'articles', 'assets', 'attachments',
  'audio', 'auth', 'aws', 'b', 'backlog', 'backup', 'backups', 'billing', 'bin', 'blob', 'blog',
  'board', 'boards', 'branches', 'browse', 'build', 'builds', 'c', 'cache', 'calendar', 'careers',
  'cargo', 'cart', 'categories', 'category', 'changelog', 'channel', 'channels', 'chat',
  'checkout', 'chrome', 'ci', 'clients', 'code', 'comments', 'commit', 'commits', 'compare',
  'component', 'components', 'config', 'configs', 'contact', 'contacts', 'containers', 'content',
  'contracts', 'controllers', 'copy', 'create', 'customers', 'd', 'dashboard', 'data', 'de',
  'default', 'delete', 'deploy', 'desktop', 'detail', 'details', 'dev', 'display', 'dist', 'doc',
  'docker', 'docs', 'document', 'documents', 'download', 'downloads', 'draft', 'drafts', 'drive',
  'edit', 'en', 'env', 'etc', 'events', 'export', 'exports', 'f', 'faq', 'file', 'files', 'final',
  'firefox', 'fixtures', 'folder', 'folders', 'form', 'forms', 'git', 'go', 'google', 'health',
  'help', 'helpers', 'home', 'html', 'hu', 'idea', 'image', 'images', 'img', 'import', 'in',
  'include', 'index', 'invite', 'invoice', 'invoices', 'issues', 'item', 'items', 'j', 'java',
  'job', 'jobs', 'join', 'js', 'kube', 'layouts', 'lib', 'lib64', 'library', 'license', 'list',
  'local', 'log', 'login', 'logs', 'main', 'master', 'media', 'meeting', 'meetings',
  'merge_requests', 'message', 'messages', 'microsoft', 'migrations', 'mnt', 'model', 'models',
  'module', 'modules', 'mozilla', 'music', 'new', 'news', 'node', 'node_modules', 'notes',
  'notifications', 'npm', 'object', 'objects', 'old', 'onedrive', 'opt', 'order', 'orders', 'org',
  'overview', 'p', 'package', 'packages', 'page', 'pages', 'payment', 'payments', 'people',
  'photo', 'photos', 'pictures', 'pip', 'pipelines', 'post', 'posts', 'preferences',
  'presentation', 'presentations', 'preview', 'private', 'product', 'products', 'profile',
  'program', 'programdata', 'project', 'projects', 'pub', 'public', 'pull', 'pulls', 'python',
  'question', 'questions', 'r', 'raw', 'readme', 'record', 'records', 'release', 'releases',
  'repo', 'report', 'reports', 'repos', 'results', 'reviews', 'roaming', 'root', 'routes', 'rust',
  's', 'sbin', 'screenshot', 'screenshots', 'scripts', 'search', 'service', 'services', 'settings',
  'share', 'shared', 'sheets', 'site', 'site-packages', 'sites', 'slides', 'source', 'space',
  'spaces', 'spec', 'specs', 'spreadsheets', 'sprint', 'sprints', 'src', 'srv', 'ssh', 'static',
  'status', 'storage', 'styles', 'summary', 'support', 'system32', 'tag', 'tags', 'target', 'task',
  'tasks', 'team', 'teams', 'temp', 'templates', 'test', 'tests', 'thread', 'threads', 'ticket',
  'tickets', 'tmp', 'tree', 'u', 'update', 'uploads', 'user', 'users', 'usr', 'utils', 'v', 'v1',
  'v2', 'v3', 'var', 'venv', 'video', 'videos', 'view', 'views', 'vscode', 'w', 'watch', 'web',
  'wiki', 'windows', 'work', 'workspace', 'workspaces', 'www', 'x86', 'yarn',
]);

/** Host labels that name a service role rather than an organisation. */
const GENERIC_HOST_LABELS: ReadonlySet<string> = new Set([
  'www', 'app', 'api', 'docs', 'drive', 'mail', 'wiki', 'jira', 'git', 'gitlab', 'portal',
  'intranet', 'cloud', 'dev', 'staging', 'prod', 'static', 'cdn', 'login', 'auth', 'admin', 'crm',
  'erp', 'hr', 'shop', 'store', 'blog', 'files', 'share', 'meet', 'calendar', 'db', 'sql', 'redis',
  'mongo', 'ci', 'build', 'jenkins', 'grafana', 'kibana', 'confluence', 'sso', 'vpn', 'internal',
  'teams', 'my', 'lightning', 'onedrive', 'm',
]);

/** Public services whose own domain is safe to keep; only a customer
 *  subdomain (`acme.sharepoint.com`) and the path identify anyone. */
const PUBLIC_DOMAINS: ReadonlySet<string> = new Set([
  'google.com', 'dropbox.com', 'notion.so', 'notion.site', 'figma.com', 'linkedin.com',
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'threads.net',
  'medium.com', 'box.com', 'zoom.us', 'microsoft.com', 'live.com', '1drv.ms', 'trello.com',
  'miro.com', 'airtable.com', 'calendly.com', 'wetransfer.com', 'we.tl', 't.me', 'wa.me',
  'forms.gle', 'youtube.com', 'github.com', 'sharepoint.com', 'atlassian.net', 'slack.com',
  'zendesk.com', 'salesforce.com', 'force.com', 'service-now.com', 'okta.com', 'webex.com',
  'freshdesk.com', 'myworkday.com', 'bamboohr.com', 'gitlab.io',
]);

/** Social hosts where the first path segment is a handle. */
const PROFILE_DOMAINS: ReadonlySet<string> = new Set([
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'threads.net', 't.me',
  'wa.me',
]);

/** Top-level labels that only resolve inside a private network. */
const PRIVATE_SUFFIXES: ReadonlySet<string> = new Set([
  'internal', 'intranet', 'intra', 'corp', 'local', 'lan', 'localdomain', 'home', 'private',
]);

/** A path segment after one of these names an account. */
const FS_ACCOUNT_MARKERS: ReadonlySet<string> = new Set(['home', 'users', 'media']);
const URL_ACCOUNT_MARKERS: ReadonlySet<string> = new Set([
  'in', 'pub', 'u', 'user', 'users', 'profile', 'people', 'member', 'members', 'author', 'authors',
]);

/** Neutral stand-ins for project, client and document names. */
const WORD_POOL: readonly string[] = [
  'alpha', 'bravo', 'cedar', 'delta', 'ember', 'falcon', 'harbor', 'juniper', 'lumen', 'maple',
  'nova', 'orbit', 'quartz', 'raven', 'sierra', 'tundra',
];

const EXAMPLE_DOMAINS: readonly string[] = ['example.com', 'example.org', 'example.net'];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const EXTENSION_RE = /^(.+?)((?:\.[A-Za-z0-9]{1,5})+)$/;

/** Stand-in for a private URL (with or without scheme). */
export function syntheticLink(original: string, standIns: LinkStandIns): string {
  const schemeMatch = /^([a-z][a-z0-9+-]*:\/\/)/i.exec(original);
  const scheme = schemeMatch?.[1] ?? '';
  let rest = original.slice(scheme.length);

  const fragmentAt = rest.indexOf('#');
  const fragment = fragmentAt >= 0 ? rest.slice(fragmentAt + 1) : null;
  if (fragmentAt >= 0) rest = rest.slice(0, fragmentAt);
  const queryAt = rest.indexOf('?');
  const query = queryAt >= 0 ? rest.slice(queryAt + 1) : null;
  if (queryAt >= 0) rest = rest.slice(0, queryAt);
  const pathAt = rest.indexOf('/');
  const authority = pathAt >= 0 ? rest.slice(0, pathAt) : rest;
  const path = pathAt >= 0 ? rest.slice(pathAt) : '';

  const rng = seeded(`${standIns.index}|${original}`);

  if (scheme.toLowerCase() === 'file://') {
    return `${scheme}${authority}${standInPath(path, standIns, rng, FS_ACCOUNT_MARKERS)}`;
  }

  const at = authority.lastIndexOf('@');
  const userinfo = at >= 0 ? authority.slice(0, at) : null;
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  const colon = hostPort.lastIndexOf(':');
  const host = colon >= 0 ? hostPort.slice(0, colon) : hostPort;
  const port = colon >= 0 ? hostPort.slice(colon) : '';

  const lowerHost = host.toLowerCase();
  const profileHost = [...PROFILE_DOMAINS].some((d) => lowerHost === d || lowerHost.endsWith(`.${d}`));

  let out = scheme;
  if (userinfo !== null) {
    const password = userinfo.includes(':') ? `:${scramble(userinfo.split(':').slice(1).join(':'), rng)}` : '';
    out += `${standIns.username}${password}@`;
  }
  out += standInHost(host, standIns) + port;
  out += standInPath(path, standIns, rng, URL_ACCOUNT_MARKERS, profileHost);
  if (query !== null) out += `?${standInQuery(query, standIns, rng)}`;
  if (fragment !== null) {
    out += `#${fragment.includes('=') ? standInQuery(fragment, standIns, rng) : standInWords(fragment, rng)}`;
  }
  return out;
}

/** Stand-in for a private filesystem path (POSIX, drive-letter or UNC). */
export function syntheticPath(original: string, standIns: LinkStandIns): string {
  const rng = seeded(`${standIns.index}|${original}`);
  const unc = /^(\\{2,4})([^\\/]+)/.exec(original);
  if (unc) {
    const server = `fs${String(standIns.index + 1).padStart(2, '0')}`;
    const rest = original.slice(unc[0].length);
    return `${unc[1]}${server}${standInPath(rest, standIns, rng, FS_ACCOUNT_MARKERS)}`;
  }
  return standInPath(original, standIns, rng, FS_ACCOUNT_MARKERS);
}

function standInHost(host: string, standIns: LinkStandIns): string {
  if (IPV4_RE.test(host)) return standIns.ip;
  const labels = host.split('.');
  if (labels.length === 1) {
    return isGenericLabel(host) ? host : `srv${String(standIns.index + 1).padStart(2, '0')}`;
  }

  const lower = labels.map((l) => l.toLowerCase());
  const registrable = lower.slice(-2).join('.');
  const tld = lower[lower.length - 1];
  let tail: string;
  if (PUBLIC_DOMAINS.has(registrable)) {
    tail = labels.slice(-2).join('.');
  } else if (PRIVATE_SUFFIXES.has(tld)) {
    tail = `example.${labels[labels.length - 1]}`;
  } else {
    tail = EXAMPLE_DOMAINS[standIns.index % EXAMPLE_DOMAINS.length];
  }

  const subLabels = labels.slice(0, -2).map((label, i) =>
    isGenericLabel(label) ? label : matchCase(label, WORD_POOL[(standIns.index + i) % WORD_POOL.length]),
  );
  return [...subLabels, tail].join('.');
}

function isGenericLabel(label: string): boolean {
  const words = label.toLowerCase().split(/[-_\d]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC_HOST_LABELS.has(w));
}

/** Rewrite each segment, keeping every separator exactly as written. */
function standInPath(
  path: string,
  standIns: LinkStandIns,
  rng: () => number,
  accountMarkers: ReadonlySet<string>,
  firstIsHandle = false,
): string {
  const parts = path.split(/([\\/]+)/);
  let previous: string | null = null;
  let first = true;
  return parts
    .map((part) => {
      if (part === '' || /^[\\/]+$/.test(part)) return part;
      const lower = part.toLowerCase();
      let result: string;
      if (/^[A-Za-z]:$/.test(part) || part === '~' || part === '$HOME') {
        result = part;
      } else if (part.startsWith('@')) {
        result = `@${standIns.username}`;
      } else if (
        (previous !== null && accountMarkers.has(previous) && !COMMON_WORDS.has(lower))
        || (firstIsHandle && first && !COMMON_WORDS.has(lower))
      ) {
        result = /^\d+$/.test(part) ? scramble(part, rng) : standIns.username;
      } else {
        result = standInSegment(part, standIns, rng);
      }
      previous = lower;
      first = false;
      return result;
    })
    .join('');
}

function standInQuery(query: string, standIns: LinkStandIns, rng: () => number): string {
  return query
    .split(/([&;])/)
    .map((pair) => {
      if (pair === '&' || pair === ';') return pair;
      const eq = pair.indexOf('=');
      if (eq < 0) return standInSegment(pair, standIns, rng);
      const value = pair.slice(eq + 1);
      return `${pair.slice(0, eq)}=${value === '' ? '' : standInSegment(value, standIns, rng)}`;
    })
    .join('');
}

/** One path segment or query value: keep structural words, replace the rest. */
function standInSegment(segment: string, standIns: LinkStandIns, rng: () => number): string {
  const decoded = segment.replace(/%40/gi, '@');
  if (EMAIL_RE.test(decoded)) {
    const email = `${standIns.username}@${EXAMPLE_DOMAINS[standIns.index % EXAMPLE_DOMAINS.length]}`;
    return decoded === segment ? email : email.replace('@', '%40');
  }
  const ext = EXTENSION_RE.exec(segment);
  const stem = ext ? ext[1] : segment;
  const suffix = ext ? ext[2] : '';
  return standInWords(stem, rng) + suffix;
}

function standInWords(stem: string, rng: () => number): string {
  if (COMMON_WORDS.has(stem.toLowerCase())) return stem;
  // Ticket keys and similar compact IDs keep their shape as one unit.
  if (/^[A-Za-z]{1,10}[-_]?\d+$|^\d+[-_]?[A-Za-z]{1,10}$/.test(stem) && !/^\d{1,4}$/.test(stem)) {
    return scramble(stem, rng);
  }
  return stem
    .split(/([-_.\s+()]+|%[0-9A-Fa-f]{2})/)
    .map((word, i) => (i % 2 === 1 ? word : standInWord(word, rng)))
    .join('');
}

function standInWord(word: string, rng: () => number): string {
  if (word === '' || COMMON_WORDS.has(word.toLowerCase())) return word;
  if (/^\d{1,4}$/.test(word)) return word; // page numbers, years, short ids
  if (/\d/.test(word)) return scramble(word, rng);
  return matchCase(word, WORD_POOL[Math.floor(rng() * WORD_POOL.length)]);
}

/** Replace letters with letters and digits with digits, keeping case,
 *  punctuation and hex-ness, so IDs, UUIDs and tokens keep their format. */
function scramble(value: string, rng: () => number): string {
  const hex = /^[0-9a-f-]+$/i.test(value) && /[0-9]/.test(value);
  const letters = hex ? 'abcdef' : 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (const ch of value) {
    if (/[0-9]/.test(ch)) {
      out += String(Math.floor(rng() * 10));
    } else if (/[a-z]/.test(ch)) {
      out += letters[Math.floor(rng() * letters.length)];
    } else if (/[A-Z]/.test(ch)) {
      out += letters[Math.floor(rng() * letters.length)].toUpperCase();
    } else {
      out += ch;
    }
  }
  return out;
}

function matchCase(original: string, word: string): string {
  if (original === original.toUpperCase() && /[A-Z]/.test(original)) return word.toUpperCase();
  if (/^[A-Z]/.test(original)) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/** FNV-1a seeded mulberry32 — small, deterministic, good enough for shapes. */
function seeded(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
