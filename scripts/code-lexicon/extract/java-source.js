/**
 * Names from Java source files (GWT's Apache-2.0 JRE emulation): the public
 * top-level and nested types, their supertypes, and public members. Regex
 * level — enough for API names.
 */

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ').replace(/"(?:\\.|[^"\\])*"/g, '""');
}

/**
 * The text of a type body opened just before `start`, with nested blocks
 * (method bodies, inner types) replaced by `;` so only member signatures remain.
 */
function topLevelBody(source, start) {
  let depth = 0;
  let out = '';
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      if (depth === 0) out += ';';
      depth += 1;
    } else if (ch === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}

function parseJavaSource(text) {
  const source = stripComments(text);
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(source)?.[1] ?? '';
  const types = new Map(); // simple name → { members:Set, supers:[] }
  // Package-private types too: public types inherit public members from them (`HashMap` ← `AbstractHashMap`).
  const typeRe = /(?:^|[\s;{}])(public\s+)?(?:(?:static|final|abstract|sealed|non-sealed|strictfp|private|protected)\s+)*(class|interface|enum|@interface|record)\s+(\w+)(?:<[^{]*?>)?([^{]*)\{/g;
  for (const declaration of source.matchAll(typeRe)) {
    const header = declaration[4];
    const supers = [...header.matchAll(/(?:extends|implements)\s+([^{]+)/g)]
      .flatMap((m) => m[1].split(/\s*,\s*|\s+implements\s+/))
      .map((name) => name.replace(/<.*$/, '').trim().split('.').pop())
      .filter((name) => /^[A-Z]\w*$/.test(name));
    const body = topLevelBody(source, declaration.index + declaration[0].length);
    const members = new Set();
    const kind = declaration[2];
    const isInterface = kind === 'interface';
    // Interface methods are public without the keyword.
    const memberRe = isInterface
      ? /(?:^|[;{}])\s*(?:(?:public|static|default|abstract)\s+)*(?:<[^>]+>\s+)?[\w.<>[\], ?]+\s+(\w+)\s*\(/g
      : /\bpublic\s+(?:(?:static|final|abstract|synchronized|native|default)\s+)*(?:<[^>]+>\s+)?[\w.<>[\], ?]+\s+(\w+)\s*[(=;]/g;
    for (const member of body.matchAll(memberRe)) members.add(member[1]);
    if (kind === 'enum') {
      const constants = /^\s*([A-Z][A-Z0-9_]*(?:\s*\([^)]*\))?(?:\s*,\s*[A-Z][A-Z0-9_]*(?:\s*\([^)]*\))?)*)\s*[;}]/.exec(body);
      if (constants) for (const name of constants[1].matchAll(/[A-Z][A-Z0-9_]*/g)) members.add(name[0]);
    }
    types.set(declaration[3], { members, supers, isPublic: Boolean(declaration[1]) });
  }
  return { pkg, types };
}

function flatJavaSourceMembers(types, name, seen = new Set()) {
  const out = new Set();
  if (seen.has(name)) return out;
  seen.add(name);
  const type = types.get(name);
  if (!type) return out;
  for (const member of type.members) out.add(member);
  for (const base of type.supers) for (const member of flatJavaSourceMembers(types, base, seen)) out.add(member);
  return out;
}

module.exports = { parseJavaSource, flatJavaSourceMembers };
