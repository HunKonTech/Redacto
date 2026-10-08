/** Shared helpers of the code lexicon generator. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Whether a name is distinctive enough to be kept as a library name on its
 * own: two or more words (`addEventListener`, `MouseEvent`, `HTMLElement`),
 * a digit after letters (`Renderer2`, `Path2D`), or a `$`/`_` sigil. Single
 * generic words (`Comment`, `status`, `close`) are too likely to be the
 * user's own and are only kept by a rule that says so (a language's core
 * namespace, a spec's `keep`).
 */
function isDistinctive(name) {
  if (/^[$_]/.test(name)) return true;
  if (/[a-z0-9][A-Z]/.test(name)) return true;
  if (/[A-Z]{2,}[a-z]/.test(name)) return true;
  if (/[A-Za-z]\d/.test(name)) return true;
  if (/_/.test(name.slice(1))) return true;
  return false;
}

/** Sorted, de-duplicated identifier names. */
function cleanNames(names) {
  return [...new Set([...names].filter((name) => IDENTIFIER_RE.test(name)))].sort();
}

/** Member names without private ones (`_uid`, `__init__`). */
function publicMembers(names) {
  return cleanNames([...names].filter((name) => !name.startsWith('_')));
}

function sortObject(object) {
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));
}

function packageVersion(name) {
  return JSON.parse(fs.readFileSync(path.join(NODE_MODULES, name, 'package.json'), 'utf8')).version;
}

/**
 * Whether a module / namespace / package name matches one of `patterns`:
 * exactly, or below a pattern written as `prefix.*`.
 */
function matchesModule(name, patterns = []) {
  return patterns.some((pattern) => (pattern.endsWith('.*') ? name === pattern.slice(0, -2) || name.startsWith(pattern.slice(0, -1)) : name === pattern));
}

/** A lexicon object with every field present and sorted. */
function lexicon({ id, languages, sources, globals = [], types = [], namespaces = [], members = {}, valueTypes = [], optionTypes = [] }) {
  const cleaned = {};
  for (const [owner, names] of Object.entries(members)) {
    const list = publicMembers(names);
    if (list.length > 0) cleaned[owner] = list;
  }
  return {
    id,
    languages,
    sources,
    globals: cleanNames(globals),
    types: cleanNames(types),
    namespaces: cleanNames(namespaces),
    members: sortObject(cleaned),
    valueTypes: [...new Set(valueTypes)].filter((owner) => cleaned[owner]),
    optionTypes: [...new Set(optionTypes)].filter((owner) => cleaned[owner]),
  };
}

module.exports = { ROOT, NODE_MODULES, IDENTIFIER_RE, isDistinctive, cleanNames, publicMembers, sortObject, packageVersion, lexicon, matchesModule };
