#!/usr/bin/env node
/**
 * Machine-translates the UI dictionary into every language Google Translate
 * offers, with KO_language_translator (the git submodule of the same name,
 * https://github.com/HunKonTech/KO_language_translator). English
 * (src/shared/i18n/locales/en.ts) is the source; Hungarian is written by
 * hand and left alone.
 *
 * The translator works on one TypeScript file with an inline
 * `const DICTS = { en: {...}, de: {...} }` object, so for each batch of
 * languages this script writes such a file, runs `main.py --new-only` on it
 * and reads the result back into one JSON file per language in
 * src/shared/i18n/generated/locales/, which the builds copy to `i18n/` and the
 * UI fetches when that language is picked (src/shared/i18n/index.ts).
 *
 * Incremental: only keys a language lacks are translated. `generated/source.json`
 * keeps the English each translation was made from; a key whose English text
 * changed is dropped everywhere and translated again. Translations that lose a
 * `{placeholder}` are dropped too, so the UI falls back to English for them.
 * Each batch is written as soon as it is done, and once `--time-budget`
 * minutes have passed no new batch starts: the rest follows on the next run.
 *
 *   node scripts/i18n/machine-translate.js [--python python3]
 *     [--translator KO_language_translator] [--batch 4] [--time-budget 60]
 *     [--only de,fr] [--force] [--workers 2] [--retries 5] [--cooldown 60]
 *
 * Google rate-limits the free endpoint (HTTP 429). A batch that fails is retried
 * after `--cooldown` seconds (growing with each attempt), up to `--retries` times.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const EN_SOURCE = path.join(ROOT, 'src/shared/i18n/locales/en.ts');
const GENERATED_DIR = path.join(ROOT, 'src/shared/i18n/generated');
const LOCALES_DIR = path.join(GENERATED_DIR, 'locales');
const SNAPSHOT_FILE = path.join(GENERATED_DIR, 'source.json');
const INDEX_FILE = path.join(GENERATED_DIR, 'index.ts');

/** Languages written by hand (or the source), never machine-translated. */
const MANUAL_LOCALES = new Set(['en', 'hu']);

/** Google Translate codes that differ from the BCP 47 tag browsers report. */
const GOOGLE_TO_LOCALE = { iw: 'he', jw: 'jv', 'zh-CN': 'zh', tl: 'fil' };

/** Translated first: the EU languages, then other widely used ones. */
const PRIORITY = [
  'de', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'ro', 'cs', 'sk', 'sl', 'hr', 'bg', 'el', 'sv', 'da', 'fi', 'et', 'lv',
  'lt', 'mt', 'ga', 'uk', 'ru', 'tr', 'zh', 'zh-TW', 'ja', 'ko', 'ar', 'hi', 'id', 'vi', 'th', 'he', 'fa', 'no', 'sr',
];

const PLACEHOLDER_RE = /\{(\w+)\}/g;

function parseArgs(argv) {
  const args = {
    python: 'python3',
    translator: path.join(ROOT, 'KO_language_translator'),
    batch: 4,
    workers: 2,
    retries: 5,
    cooldown: 60,
    timeBudget: Infinity,
    only: null,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      i += 1;
      return argv[i];
    };
    if (arg === '--python') args.python = value();
    else if (arg === '--translator') args.translator = path.resolve(value());
    else if (arg === '--batch') args.batch = Math.max(1, Number.parseInt(value(), 10) || 1);
    else if (arg === '--workers') args.workers = Math.max(1, Number.parseInt(value(), 10) || 1);
    else if (arg === '--retries') args.retries = Math.max(0, Number.parseInt(value(), 10) || 0);
    else if (arg === '--cooldown') args.cooldown = Math.max(0, Number(value()) || 0);
    else if (arg === '--time-budget') args.timeBudget = Number(value()) || Infinity;
    else if (arg === '--only') args.only = new Set(value().split(',').map((code) => code.trim()).filter(Boolean));
    else if (arg === '--force') args.force = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

/** The English dictionary, read from en.ts without a TypeScript compiler. */
function readSourceMessages(file = EN_SOURCE) {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/const\s+en\s*=\s*(\{[\s\S]*\})\s*as\s+const\s*;/);
  if (!match) throw new Error(`No \`const en = { ... } as const;\` in ${file}`);
  return vm.runInNewContext(`(${match[1]})`, Object.create(null));
}

function placeholders(message) {
  return [...message.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).sort().join(',');
}

function toLocale(googleCode) {
  return GOOGLE_TO_LOCALE[googleCode] ?? googleCode;
}

/**
 * A JS string literal in plain ASCII. main.py decodes escaped values with
 * Python's `unicode_escape`, which reads raw UTF-8 bytes as Latin-1, so every
 * non-ASCII character is written as `\uXXXX` (`\UXXXXXXXX` beyond the BMP).
 */
function asciiLiteral(value) {
  let out = '';
  for (const char of JSON.stringify(value)) {
    const code = char.codePointAt(0);
    if (code < 0x80) out += char;
    else if (code <= 0xffff) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += `\\U${code.toString(16).padStart(8, '0')}`;
  }
  return out;
}

/** The input file for main.py: English plus each language of the batch. */
function writeDictsFile(file, en, batch) {
  const block = (name, messages) => {
    const lines = Object.entries(messages).map(([key, value]) => `    ${JSON.stringify(key)}: ${asciiLiteral(value)},`);
    return [`  ${JSON.stringify(name)}: {`, ...lines, '  },'].join('\n');
  };
  const blocks = [block('en', en), ...batch.map(({ googleCode, messages }) => block(googleCode, messages))];
  fs.writeFileSync(file, `const DICTS = {\n${blocks.join('\n')}\n};\n`);
}

function unescapeTs(value) {
  return value.replace(/\\(.)/gs, (_, char) => (char === 'n' ? '\n' : char));
}

/** Reads the DICTS object back in the layout main.py writes it. */
function readDictsFile(file) {
  const dicts = {};
  let current = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const lang = line.match(/^ {2}([A-Za-z0-9_$'"-]+): \{$/);
    if (lang) {
      current = dicts[lang[1].replace(/['"]/g, '')] = {};
      continue;
    }
    const entry = line.match(/^ {4}"((?:[^"\\]|\\.)*)": "((?:[^"\\]|\\.)*)",$/);
    if (entry && current) current[entry[1]] = unescapeTs(entry[2]);
  }
  return dicts;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Keeps the English keys only, in English order, and drops empty values. */
function orderLike(en, messages) {
  const ordered = {};
  for (const key of Object.keys(en)) {
    if (typeof messages[key] === 'string' && messages[key].trim() !== '') ordered[key] = messages[key];
  }
  return ordered;
}

/** Drops translations whose `{placeholders}` differ from the English message. */
function keepValidTranslations(en, messages, report = () => {}) {
  const valid = {};
  for (const [key, value] of Object.entries(orderLike(en, messages))) {
    if (placeholders(value) === placeholders(en[key])) valid[key] = value;
    else report(key, value);
  }
  return valid;
}

/** Keys whose English text differs from the one the translations were made from. */
function changedSourceKeys(en, snapshot) {
  return Object.keys(en).filter((key) => key in snapshot && snapshot[key] !== en[key]);
}

/** Picker names Intl gets wrong or too vague. */
const NAME_OVERRIDES = { zh: '简体中文', 'zh-TW': '繁體中文' };

function nativeName(locale, englishName) {
  if (NAME_OVERRIDES[locale]) return NAME_OVERRIDES[locale];
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale);
    if (name && name.toLowerCase() !== locale.toLowerCase()) {
      // Capitals only where names take them (not e.g. Georgian's Mtavruli).
      return /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u.test(name)
        ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
        : name;
    }
  } catch {
    // Not a tag Intl knows: use the English name.
  }
  return englishName.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** generated/index.ts: every machine-translated language, sorted by its own name. */
function renderIndex(languages) {
  const sorted = [...languages].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const lines = (render) => sorted.map((language) => `  ${render(language)},\n`).join('');
  const codes = lines(({ locale }) => JSON.stringify(locale));
  const names = lines(({ locale, name }) => `${JSON.stringify(locale)}: ${JSON.stringify(name)}`);
  return `/**
 * Generated by scripts/i18n/machine-translate.js — do not edit by hand.
 *
 * Machine-translated UI languages. Their dictionaries are
 * ./locales/<code>.json, copied to \`i18n/\` by the builds and fetched when
 * the language is picked.
 */

export const GENERATED_LOCALES = [
${codes}] as const;

export type GeneratedLocale = (typeof GENERATED_LOCALES)[number];

/** Each language's own name, for the language picker. */
export const GENERATED_LOCALE_NAMES: Record<GeneratedLocale, string> = {
${names}};
`;
}

function listLanguages(args) {
  const result = spawnSync(args.python, [path.join(__dirname, 'list-languages.py'), args.translator], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Listing the translator's languages failed:\n${result.stderr || result.error}`);
  }
  return JSON.parse(result.stdout)
    .filter(({ code }) => !MANUAL_LOCALES.has(toLocale(code)))
    .map(({ code, name }) => ({ googleCode: code, locale: toLocale(code), englishName: name }));
}

function byPriority(a, b) {
  const rank = (locale) => (PRIORITY.includes(locale) ? PRIORITY.indexOf(locale) : PRIORITY.length);
  return rank(a.locale) - rank(b.locale) || a.locale.localeCompare(b.locale);
}

/** Runs main.py on one batch; null when it failed or ran past `timeoutMs` (stopped). */
function runTranslator(args, batch, en, timeoutMs) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redacto-i18n-'));
  const file = path.join(workDir, 'i18n.ts');
  try {
    writeDictsFile(file, en, batch);
    const started = Date.now();
    const maxAttempts = args.retries + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = spawnSync(
        args.python,
        [
          path.join(args.translator, 'main.py'), args.force ? '--force' : '--new-only',
          '--i18n-file', file, '--i18n-source-lang', 'en', '--workers', String(args.workers),
        ],
        { stdio: 'inherit', timeout: Number.isFinite(timeoutMs) ? Math.max(1, Math.round(timeoutMs)) : undefined },
      );
      if (result.error?.code === 'ETIMEDOUT') {
        console.log('Time budget used up during the batch; it is translated again on the next run.');
        return null;
      }
      if (result.status === 0) break;
      if (attempt === maxAttempts) {
        console.warn(`::warning::The translator exited with ${result.status ?? result.error}; this batch is kept as it was.`);
        return null;
      }
      const wait = args.cooldown * attempt;
      if (Number.isFinite(timeoutMs) && Date.now() + wait * 1000 >= started + timeoutMs) {
        console.log('Not enough time budget left to wait out the rate limit; this batch follows on the next run.');
        return null;
      }
      console.warn(`Translator failed (${result.status ?? result.error}), probably rate limited; retry ${attempt}/${args.retries} in ${wait}s.`);
      spawnSync('sleep', [String(wait)], { stdio: 'ignore' });
    }
    return readDictsFile(file);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const en = readSourceMessages();
  fs.mkdirSync(LOCALES_DIR, { recursive: true });

  const languages = listLanguages(args);
  const known = new Set(languages.map(({ locale }) => locale));
  for (const file of fs.readdirSync(LOCALES_DIR)) {
    if (file.endsWith('.json') && !known.has(path.basename(file, '.json'))) {
      console.log(`Removing ${file}: no longer offered by the translator.`);
      fs.rmSync(path.join(LOCALES_DIR, file));
    }
  }

  // English text that changed since the last run: translate those keys again.
  const changed = new Set(changedSourceKeys(en, readJson(SNAPSHOT_FILE, {})));
  if (changed.size) console.log(`English changed for ${changed.size} key(s); they are translated again.`);
  const dictionaries = new Map();
  for (const language of languages) {
    const file = path.join(LOCALES_DIR, `${language.locale}.json`);
    const existing = orderLike(en, readJson(file, {}));
    for (const key of changed) delete existing[key];
    dictionaries.set(language.locale, existing);
    if (changed.size && fs.existsSync(file)) writeJson(file, existing);
  }
  writeJson(SNAPSHOT_FILE, en);

  const total = Object.keys(en).length;
  const pending = languages
    .filter(({ locale }) => !args.only || args.only.has(locale))
    .filter(({ locale }) => args.force || Object.keys(dictionaries.get(locale)).length < total)
    .sort(byPriority);
  console.log(`${pending.length} of ${languages.length} languages need translating (${total} keys each).`);

  for (let i = 0; i < pending.length; i += args.batch) {
    const remainingMs = args.timeBudget * 60000 - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      console.log(`Time budget of ${args.timeBudget} min used; ${pending.length - i} language(s) left for the next run.`);
      break;
    }
    const batch = pending.slice(i, i + args.batch).map((language) => ({ ...language, messages: dictionaries.get(language.locale) }));
    console.log(`\nTranslating ${batch.map(({ locale }) => locale).join(', ')}`);
    const before = batch.reduce((sum, { messages }) => sum + Object.keys(messages).length, 0);
    const result = runTranslator(args, batch, en, remainingMs);
    if (!result) break;
    const after = batch.reduce((sum, { googleCode }) => sum + Object.keys(result[googleCode] ?? {}).length, 0);
    if (!args.force && after <= before) {
      // Every request failed: Google is rate-limiting or blocking this machine.
      console.warn('::warning::Nothing was translated in this batch (Google rate limit?); stopping until the next run.');
      break;
    }
    for (const { googleCode, locale } of batch) {
      const messages = keepValidTranslations(en, result[googleCode] ?? {}, (key, value) =>
        console.warn(`::warning::${locale} ${key}: placeholders lost in "${value}"; left in English.`),
      );
      dictionaries.set(locale, messages);
      writeJson(path.join(LOCALES_DIR, `${locale}.json`), messages);
      console.log(`${locale}: ${Object.keys(messages).length}/${total} keys`);
    }
  }

  // Every language is offered, translated or not: keys it lacks show in English.
  // A language with nothing translated yet gets an empty dictionary, so picking
  // it loads a file instead of failing.
  for (const { locale } of languages) {
    const file = path.join(LOCALES_DIR, `${locale}.json`);
    if (!fs.existsSync(file)) writeJson(file, {});
  }
  const available = languages.map(({ locale, englishName }) => ({ locale, name: nativeName(locale, englishName) }));
  fs.writeFileSync(INDEX_FILE, renderIndex(available));
  const complete = languages.filter(({ locale }) => Object.keys(dictionaries.get(locale)).length === total).length;
  console.log(`\n${available.length} machine-translated language(s) available, ${complete} fully translated.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  asciiLiteral,
  changedSourceKeys,
  keepValidTranslations,
  nativeName,
  readDictsFile,
  readSourceMessages,
  renderIndex,
  toLocale,
  writeDictsFile,
};
