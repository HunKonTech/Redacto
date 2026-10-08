/**
 * Names from RBS signatures (ruby/rbs `core/*.rbs`): classes and modules,
 * their instance and singleton methods (`?`, `!`, `=` suffixes dropped — the
 * code lexer reads `empty?` as `empty`), attributes and aliases.
 */

function parseRbs(texts) {
  const classes = new Map(); // name → { members:Set, statics:Set, includes:Set, superclass }
  for (const text of texts) {
    const stack = [];
    for (const raw of text.split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const declaration = /^(class|module|interface)\s+(?:::)?([A-Z_][\w:]*)(?:\[[^\]]*\])?(?:\s*<\s*([A-Z][\w:]*))?/.exec(line);
      if (declaration) {
        const name = declaration[2].split('::').pop();
        if (!classes.has(name)) classes.set(name, { members: new Set(), statics: new Set(), includes: new Set(), superclass: null, kind: declaration[1] });
        const entry = classes.get(name);
        if (declaration[3]) entry.superclass = declaration[3].split('::').pop();
        stack.push(entry);
        continue;
      }
      if (line === 'end') {
        stack.pop();
        continue;
      }
      const current = stack[stack.length - 1];
      if (!current) continue;
      const method = /^def\s+(self\??\.)?([a-z_][\w]*[?!=]?|[A-Z]\w*)\s*:/.exec(line);
      if (method) {
        const name = method[2].replace(/[?!=]$/, '');
        (method[1] ? current.statics : current.members).add(name);
        if (method[1] === 'self?.') current.members.add(name);
        continue;
      }
      const attr = /^attr_(?:reader|writer|accessor)\s+(\w+)/.exec(line);
      if (attr) current.members.add(attr[1]);
      const alias = /^alias\s+(self\.)?([a-z_]\w*)[?!=]?\s/.exec(line);
      if (alias) (alias[1] ? current.statics : current.members).add(alias[2]);
      const include = /^include\s+([A-Z][\w:]*)/.exec(line);
      if (include) current.includes.add(include[1].split('::').pop());
    }
  }
  return classes;
}

function flatRbsMembers(classes, name, seen = new Set()) {
  const out = new Set();
  if (seen.has(name)) return out;
  seen.add(name);
  const cls = classes.get(name);
  if (!cls) return out;
  for (const member of cls.members) out.add(member);
  for (const base of [cls.superclass, ...cls.includes]) if (base && base !== 'Object' && base !== 'BasicObject') for (const member of flatRbsMembers(classes, base, seen)) out.add(member);
  return out;
}

module.exports = { parseRbs, flatRbsMembers };
