/**
 * Names from Python type stubs (`.pyi`), read line by line (stubs are
 * black-formatted and regular; nothing is imported or executed):
 * module-level functions, classes with their members and base classes,
 * variables, re-exports (`from x import a as a`), and parameter names.
 */

function parsePyi(text) {
  const module = { functions: new Set(), classes: new Map(), variables: new Set(), reexports: new Set(), params: new Set() };
  const stack = []; // { indent, cls }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) stack.pop();
    const cls = stack.length > 0 ? stack[stack.length - 1].cls : null;

    let match = /^class\s+(\w+)\s*(?:\[[^\]]*\])?\s*(?:\(([^)]*)\)?)?\s*:/.exec(line);
    if (match) {
      const entry = { members: new Set(), bases: (match[2] ?? '').split(',').map((b) => b.trim().replace(/\[.*$/, '').split('.').pop()).filter(Boolean) };
      if (!cls) module.classes.set(match[1], entry);
      else cls.members.add(match[1]);
      stack.push({ indent, cls: entry });
      continue;
    }
    match = /^(?:async\s+)?def\s+(\w+)\s*(?:\[[^\]]*\])?\s*\(/.exec(line);
    if (match) {
      // Signature may span lines: collect up to the closing `) ... :`.
      let signature = line.slice(line.indexOf('(') + 1);
      let depth = 1 + (signature.match(/[([{]/g) ?? []).length - (signature.match(/[)\]}]/g) ?? []).length;
      while (depth > 0 && i + 1 < lines.length) {
        i += 1;
        signature += ` ${lines[i].trim()}`;
        depth += (lines[i].match(/[([{]/g) ?? []).length - (lines[i].match(/[)\]}]/g) ?? []).length;
      }
      for (const param of signature.matchAll(/(?:^|[(,]\s*)\*{0,2}(\w+)\s*(?=[:=,)])/g)) {
        if (!['self', 'cls', 'args', 'kwargs'].includes(param[1])) module.params.add(param[1]);
      }
      if (cls) cls.members.add(match[1]);
      else module.functions.add(match[1]);
      // `def __getattr__(self, name: Literal["objects"])`: attributes the stub declares by name.
      if (match[1] === '__getattr__' && cls) {
        for (const literal of signature.matchAll(/Literal\[([^\]]*)\]/g)) {
          for (const attr of literal[1].matchAll(/["'](\w+)["']/g)) cls.members.add(attr[1]);
        }
      }
      continue;
    }
    match = /^(\w+)\s*(?::[^=]+)?(?:=|$|:)/.exec(line);
    if (match && !/^(?:if|elif|else|from|import|return|raise|pass|try|except|with|for|while|del|global|assert|type)\b/.test(line)) {
      if (cls) cls.members.add(match[1]);
      else module.variables.add(match[1]);
      continue;
    }
    if (!cls && /^from\s+\S+\s+import\s+/.test(line)) {
      let names = line.replace(/^from\s+\S+\s+import\s+/, '');
      if (names.startsWith('(') && !names.includes(')')) {
        while (i + 1 < lines.length && !lines[i].includes(')')) {
          i += 1;
          names += ` ${lines[i].trim()}`;
        }
      }
      // Stubs re-export with `name as name`.
      for (const alias of names.matchAll(/(\w+)\s+as\s+(\w+)/g)) if (alias[1] === alias[2]) module.reexports.add(alias[2]);
    }
  }
  return module;
}

/** Members of a class including bases defined in the same set of modules. */
function flatPyMembers(classes, name, seen = new Set()) {
  const out = new Set();
  if (seen.has(name)) return out;
  seen.add(name);
  const cls = classes.get(name);
  if (!cls) return out;
  for (const member of cls.members) out.add(member);
  for (const base of cls.bases) for (const member of flatPyMembers(classes, base, seen)) out.add(member);
  return out;
}

module.exports = { parsePyi, flatPyMembers };
