/**
 * Names from JetBrains phpstorm-stubs (PHP declarations without bodies):
 * global functions, and classes/interfaces/traits/enums with their public
 * methods and constants.
 */

function parsePhpStub(text) {
  const out = { functions: new Set(), classes: new Map() };
  let current = null;
  let depth = 0;
  // `namespace { … }` blocks do not nest declarations: depth inside them counts from their brace.
  const namespaceDepths = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (line.startsWith('*') || line.startsWith('/*')) continue;
    if (/^namespace\b[^;]*\{/.test(line)) namespaceDepths.push(depth + 1);
    const base = namespaceDepths.length > 0 ? namespaceDepths[namespaceDepths.length - 1] : 0;
    const declaration = /^(?:(?:final|abstract|readonly)\s+)*(?:class|interface|trait|enum)\s+(\w+)/.exec(line);
    if (declaration && depth === base) {
      current = { members: new Set() };
      out.classes.set(declaration[1], current);
    }
    const fn = /^(?:(?:final|abstract|public|static)\s+)*function\s+&?\s*(\w+)\s*\(/.exec(line);
    if (fn) {
      if (current && depth >= base + 1) current.members.add(fn[1]);
      else if (depth === base) out.functions.add(fn[1]);
    }
    if (current && depth >= base + 1) {
      const method = /^(?:(?:final|abstract|static|public)\s+)*public\s+(?:(?:final|abstract|static)\s+)*function\s+&?\s*(\w+)/.exec(line);
      if (method) current.members.add(method[1]);
      const constant = /^(?:(?:final|public)\s+)*const\s+(?:\w+\s+)?(\w+)\s*=/.exec(line);
      if (constant) current.members.add(constant[1]);
      const property = /^public\s+(?:readonly\s+)?(?:\??[\w\\|]+\s+)?\$(\w+)/.exec(line);
      if (property) current.members.add(property[1]);
    }
    for (const ch of line) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === base) current = null;
        while (namespaceDepths.length > 0 && depth < namespaceDepths[namespaceDepths.length - 1]) namespaceDepths.pop();
      }
    }
  }
  return out;
}

module.exports = { parsePhpStub };
