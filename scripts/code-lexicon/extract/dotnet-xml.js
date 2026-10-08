/**
 * Names from .NET XML documentation files (the IntelliSense `*.xml` next to
 * reference assemblies): every `<member name="T:|M:|P:|F:|E:…">`. Only the
 * names in those attributes are read, never the documentation text.
 */

function stripGenerics(segment) {
  return segment.replace(/`+\d+$/, '');
}

/**
 * Parse member ids into `{ types: Map<fullName, { ns, name, members:Set, methods:Set }>, extensions: Map<extendedTypeName, Set> }`.
 * Extension methods: methods of static `…Extensions` classes; the extended
 * type is the simple name of their first parameter (`IServiceCollection`).
 */
function parseDotnetXml(texts) {
  const types = new Map();
  const extensions = new Map();
  const typeEntry = (full) => {
    if (!types.has(full)) {
      const dot = full.lastIndexOf('.');
      types.set(full, { ns: full.slice(0, dot), name: stripGenerics(full.slice(dot + 1)), members: new Set(), methods: new Set() });
    }
    return types.get(full);
  };
  for (const text of texts) {
    for (const match of text.matchAll(/<member name="([TMPFE]):([^"(]+)(\(([^"]*)\))?"/g)) {
      const [, kind, id, , params] = match;
      if (kind === 'T') {
        typeEntry(id.replace(/\+/g, '.'));
        continue;
      }
      const name = id.replace(/``\d+$/, '').split('.').pop();
      const owner = id.slice(0, id.length - id.split('.').pop().length - 1).replace(/\+/g, '.');
      if (!owner || name.startsWith('#') || name.includes('#')) continue;
      typeEntry(owner).members.add(name);
      if (kind === 'M') typeEntry(owner).methods.add(name);
      if (kind === 'M' && /Extensions$/.test(stripGenerics(owner.split('.').pop())) && params) {
        const first = params.split(/,(?![^{]*\})/)[0].replace(/\{.*$/, '').replace(/[@[\]]/g, '');
        const extended = stripGenerics(first.split('.').pop());
        if (!extensions.has(extended)) extensions.set(extended, new Set());
        extensions.get(extended).add(name);
      }
    }
  }
  return { types, extensions };
}

module.exports = { parseDotnetXml };
