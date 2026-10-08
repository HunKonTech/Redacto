/**
 * Names a package's type declarations export, resolved with the TypeScript
 * checker (re-exports across files and packages included): its exported
 * values, functions, classes and types, and the members of chosen types.
 */

const path = require('path');
const ts = require('typescript');

/**
 * @param {string[]} entries  `.d.ts` entry files
 * @param {string[]} packageDirs  members declared outside these dirs are left out
 */
function packageApi(entries, packageDirs = entries.map((entry) => path.dirname(entry))) {
  const program = ts.createProgram(entries, {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    types: [],
  });
  const checker = program.getTypeChecker();
  const inPackage = (declaration) => {
    const file = path.resolve(declaration.getSourceFile().fileName);
    return packageDirs.some((dir) => file.startsWith(path.resolve(dir) + path.sep));
  };
  const resolve = (symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);

  const exports = new Map(); // name → { symbol, functions, classes, values, types }
  for (const entry of entries) {
    const source = program.getSourceFile(entry);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (!moduleSymbol) throw new Error(`no module symbol for ${entry}`);
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const symbol = resolve(exported);
      const flags = symbol.flags;
      exports.set(exported.name, {
        symbol,
        isFunction: (flags & ts.SymbolFlags.Function) !== 0,
        isClass: (flags & ts.SymbolFlags.Class) !== 0,
        isValue: (flags & ts.SymbolFlags.Value) !== 0,
        isType: (flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class | ts.SymbolFlags.Enum)) !== 0,
      });
    }
  }

  /** Instance members of an exported class/interface (declared in the package), plus static ones for classes. */
  const membersOf = (name, { statics = false } = {}) => {
    const entry = exports.get(name);
    if (!entry) return null;
    const out = new Set();
    const add = (properties) => {
      for (const property of properties) {
        if ((property.declarations ?? []).some(inPackage)) out.add(property.name);
      }
    };
    if (entry.isType) add(checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(entry.symbol)));
    if (statics && entry.symbol.valueDeclaration) {
      add(checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(entry.symbol, entry.symbol.valueDeclaration)));
    }
    return out;
  };

  /** Members of a type found anywhere in the program by name (for types the package does not export). */
  const membersOfDeclared = (name) => {
    const out = new Set();
    for (const source of program.getSourceFiles()) {
      if (!packageDirs.some((dir) => path.resolve(source.fileName).startsWith(path.resolve(dir) + path.sep))) continue;
      const visit = (node) => {
        if ((ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === name) {
          const symbol = checker.getSymbolAtLocation(node.name);
          if (symbol) for (const property of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))) out.add(property.name);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return out;
  };

  return { exports, membersOf, membersOfDeclared };
}

/** The `types`/`typings` entry of an installed package. */
function typesEntry(pkg, subpath) {
  const dir = path.dirname(require.resolve(`${pkg}/package.json`));
  if (subpath) return path.join(dir, subpath);
  const manifest = require(`${pkg}/package.json`);
  return path.join(dir, manifest.types ?? manifest.typings ?? 'index.d.ts');
}

function packageDir(pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`));
}

module.exports = { packageApi, typesEntry, packageDir };
