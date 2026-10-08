#!/usr/bin/env node
/**
 * Builds the symbol lexicons code renaming uses to recognise official
 * (language, library, framework) names: `src/shared/code-lexicon/<language>.json`,
 * `src/shared/code-lexicon/profiles/<profile>.json` and `profile-signals.json`.
 *
 * Every name comes from a machine-readable source — type declarations, type
 * stubs, reference-assembly docs, class files, API listings — never from a
 * hand-written list; the rules in `scripts/code-lexicon/` only choose which
 * names count. Only names are kept, no documentation or code. The output is
 * committed, so building the extension needs neither this script nor a network.
 *
 *   node scripts/build-code-lexicon.js            write the lexicons
 *   node scripts/build-code-lexicon.js --fetch    download the pinned remote sources first
 *   node scripts/build-code-lexicon.js --check    fail when a committed lexicon is stale
 *
 * Sources from `node_modules` are always available; remote ones (NuGet,
 * Maven Central, PyPI, GitHub; `scripts/code-lexicon/sources.js`) are read
 * from `.cache/code-lexicon/`, and the outputs that need a missing one are
 * skipped (and not checked) until `--fetch` downloads it.
 *
 * Sources and licenses are listed in THIRD_PARTY_NOTICES.md.
 */

const fs = require('fs');
const path = require('path');
const { ROOT, lexicon } = require('./code-lexicon/common');
const { LANGUAGES } = require('./code-lexicon/languages');
const { GENERATORS } = require('./code-lexicon/generators');
const { isCached, fetchSources } = require('./code-lexicon/sources');

const OUT_DIR = path.join(ROOT, 'src', 'shared', 'code-lexicon');
const SPEC_DIR = path.join(__dirname, 'code-lexicon', 'profiles');

function readSpecs() {
  return fs
    .readdirSync(SPEC_DIR)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => require(path.join(SPEC_DIR, file)));
}

function alternation(names) {
  return [...names]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

/**
 * A profile's activation signals with `{{members:Owner}}` and
 * `{{namespaces}}` expanded into alternations of its names, so the runtime
 * can test them without loading the profile itself.
 */
function expandSignals(spec, generated) {
  const expand = (pattern) => {
    const expanded = pattern
      .replace(/\{\{members:([^}]+)\}\}/g, (_m, owner) => {
        const names = generated?.members?.[owner];
        if (!names) throw new Error(`${spec.id}: signal refers to members of ${owner}, which are not available`);
        return alternation(names);
      })
      .replace(/\{\{namespaces\}\}/g, () => {
        if (!generated) throw new Error(`${spec.id}: signal refers to namespaces, which are not available`);
        return alternation(generated.namespaces);
      });
    new RegExp(expanded, 'm');
    return expanded;
  };
  return (spec.signals ?? []).map((signal) => (typeof signal === 'string' ? expand(signal) : { all: signal.all.map(expand) }));
}

/** The profile lexicon: generated names plus the spec's rules; only the members the runtime reads are shipped. */
function buildProfile(spec, generated) {
  const valueTypes = generated.valueTypes ?? spec.valueTypes ?? [];
  const optionTypes = generated.optionTypes ?? spec.optionTypes ?? [];
  const signalOwners = JSON.stringify(spec.signals ?? []).match(/\{\{members:[^}]+\}\}/g)?.map((m) => m.slice(10, -2)) ?? [];
  const shipped = new Set([...valueTypes, ...optionTypes, ...signalOwners]);
  const members = Object.fromEntries(Object.entries(generated.members ?? {}).filter(([owner]) => shipped.has(owner)));
  const exclude = new Set(spec.exclude ?? []);
  const keepOnly = (names) => [...names].filter((name) => !exclude.has(name));
  return lexicon({
    id: spec.id,
    languages: spec.languages,
    sources: generated.sources,
    globals: keepOnly([...(generated.globals ?? []), ...(spec.globals ?? [])]),
    types: keepOnly(generated.types ?? []),
    namespaces: keepOnly([...(generated.namespaces ?? []), ...(spec.namespaces ?? [])]),
    members,
    valueTypes,
    optionTypes,
  });
}

/** One key per line and one member owner per line: small, and diffs stay readable. */
function serialize(data) {
  const lines = Object.entries({ generated: 'scripts/build-code-lexicon.js — do not edit by hand', ...data })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (key !== 'members') return `${JSON.stringify(key)}:${JSON.stringify(value)}`;
      const owners = Object.entries(value).map(([owner, names]) => `${JSON.stringify(owner)}:${JSON.stringify(names)}`);
      return `"members":{\n${owners.join(',\n')}\n}`;
    });
  return `{\n${lines.join(',\n')}\n}\n`;
}

const available = (needs) => needs.every(isCached);

async function main() {
  const check = process.argv.includes('--check');
  if (process.argv.includes('--fetch')) await fetchSources();

  const outputs = new Map();
  const skipped = [];
  for (const [id, language] of Object.entries(LANGUAGES)) {
    if (!available(language.needs)) {
      skipped.push(`${id}.json`);
      continue;
    }
    outputs.set(path.join(OUT_DIR, `${id}.json`), serialize(language.build()));
  }

  const signals = {};
  for (const spec of readSpecs()) {
    const generator = GENERATORS[spec.generate];
    if (!generator) throw new Error(`${spec.id}: unknown generator ${spec.generate}`);
    const generated = available(generator.needs) ? generator.build(spec) : null;
    signals[spec.id] = { languages: spec.languages, signals: expandSignals(spec, generated) };
    if (!generated) {
      skipped.push(`profiles/${spec.id}.json`);
      continue;
    }
    outputs.set(path.join(OUT_DIR, 'profiles', `${spec.id}.json`), serialize(buildProfile(spec, generated)));
  }
  outputs.set(path.join(OUT_DIR, 'profile-signals.json'), serialize({ profiles: signals }));

  let stale = 0;
  for (const [file, content] of outputs) {
    const relative = path.relative(ROOT, file);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === content) continue;
    if (check) {
      console.error(`stale: ${relative}`);
      stale += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`wrote ${relative} (${(content.length / 1024).toFixed(1)} KB)`);
  }
  if (skipped.length > 0) {
    console.log(`skipped (remote sources not cached; run with --fetch): ${skipped.join(', ')}`);
  }
  if (check && stale > 0) {
    console.error('Run `node scripts/build-code-lexicon.js` and commit the result.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildProfile, expandSignals };
