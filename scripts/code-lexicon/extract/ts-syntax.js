/**
 * Syntax-level walk of TypeScript declaration files: values, types,
 * interfaces with their members and heritage, namespaces and ambient
 * modules, merged the way TypeScript merges declarations. Used for the
 * TypeScript lib and the @types packages whose shape it reads directly.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { IDENTIFIER_RE, NODE_MODULES } = require('../common');

/** Name of a declaration or member, when it is a plain identifier. */
function declName(node) {
  const name = node.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier?.(name)) return name.text;
  if (ts.isStringLiteral(name) && IDENTIFIER_RE.test(name.text)) return name.text;
  return null;
}

function hasExport(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

function typeRefName(typeNode) {
  if (!typeNode) return null;
  if (ts.isTypeReferenceNode(typeNode)) {
    const name = typeNode.typeName;
    return ts.isIdentifier(name) ? name.text : name.right.text;
  }
  if (ts.isTypeQueryNode(typeNode)) return null;
  return null;
}

/**
 * A scope of declarations: the top level of a file, a namespace or an ambient
 * module. Interfaces merge across files the way TypeScript merges them.
 */
class Scope {
  constructor(name) {
    this.name = name;
    this.values = new Map(); // name -> type name (or null)
    this.types = new Set();
    this.interfaces = new Map(); // name -> { members:Set, heritage:Set }
    this.namespaces = new Map(); // name -> Scope
    this.exported = new Set();
    this.exportAssignment = null;
  }

  namespace(name) {
    if (!this.namespaces.has(name)) this.namespaces.set(name, new Scope(name));
    return this.namespaces.get(name);
  }

  iface(name) {
    if (!this.interfaces.has(name)) this.interfaces.set(name, { members: new Set(), heritage: new Set() });
    return this.interfaces.get(name);
  }
}

function membersOf(node) {
  const out = new Set();
  for (const member of node.members ?? []) {
    if (ts.isConstructSignatureDeclaration(member) || ts.isCallSignatureDeclaration(member) || ts.isIndexSignatureDeclaration(member)) continue;
    const name = declName(member);
    if (name && !name.startsWith('#')) out.add(name);
  }
  return out;
}

function heritageOf(node) {
  const out = new Set();
  for (const clause of node.heritageClauses ?? []) {
    for (const type of clause.types) {
      const expr = type.expression;
      if (ts.isIdentifier(expr)) out.add(expr.text);
      else if (ts.isPropertyAccessExpression(expr)) out.add(expr.name.text);
    }
  }
  return out;
}

function walkStatements(statements, scope) {
  for (const node of statements) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        scope.values.set(decl.name.text, typeRefName(decl.type));
        if (hasExport(node)) scope.exported.add(decl.name.text);
      }
    } else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
      const name = declName(node);
      if (!name) continue;
      if (ts.isClassDeclaration(node)) {
        scope.types.add(name);
        const entry = scope.iface(name);
        for (const member of membersOf(node)) entry.members.add(member);
        for (const base of heritageOf(node)) entry.heritage.add(base);
      }
      if (ts.isEnumDeclaration(node)) scope.types.add(name);
      if (!scope.values.has(name)) scope.values.set(name, null);
      if (hasExport(node)) scope.exported.add(name);
    } else if (ts.isInterfaceDeclaration(node)) {
      const name = declName(node);
      scope.types.add(name);
      const entry = scope.iface(name);
      for (const member of membersOf(node)) entry.members.add(member);
      for (const base of heritageOf(node)) entry.heritage.add(base);
      if (hasExport(node)) scope.exported.add(name);
    } else if (ts.isTypeAliasDeclaration(node)) {
      scope.types.add(declName(node));
      if (hasExport(node)) scope.exported.add(declName(node));
    } else if (ts.isModuleDeclaration(node)) {
      const isAmbientModule = ts.isStringLiteral(node.name);
      const name = node.name.text;
      if (name === 'global') {
        if (node.body && ts.isModuleBlock(node.body)) walkStatements(node.body.statements, scope.root ?? scope);
        continue;
      }
      const child = isAmbientModule ? scope.namespace(`"${name}"`) : scope.namespace(name);
      child.root = scope.root ?? scope;
      let body = node.body;
      // `namespace A.B {}`
      let target = child;
      while (body && ts.isModuleDeclaration(body)) {
        target = target.namespace(body.name.text);
        target.root = child.root;
        body = body.body;
      }
      if (body && ts.isModuleBlock(body)) walkStatements(body.statements, target);
      if (!isAmbientModule) {
        if (!scope.values.has(name)) scope.values.set(name, null);
        if (hasExport(node)) scope.exported.add(name);
      }
    } else if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      scope.exportAssignment = node.expression.text;
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) scope.exported.add(element.name.text);
    }
  }
}

function parseFiles(files, scope = new Scope('<root>')) {
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false);
    walkStatements(source.statements, scope);
  }
  return scope;
}

/** Find an interface by name in a scope tree (depth first). */
function findInterface(scope, name) {
  if (scope.interfaces.has(name)) return scope.interfaces.get(name);
  for (const child of scope.namespaces.values()) {
    const found = findInterface(child, name);
    if (found) return found;
  }
  return null;
}

/** Members of an interface including the ones it inherits. */
function flatMembers(scopes, name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const out = new Set();
  for (const scope of scopes) {
    const entry = findInterface(scope, name);
    if (!entry) continue;
    for (const member of entry.members) out.add(member);
    for (const base of entry.heritage) for (const member of flatMembers(scopes, base, seen)) out.add(member);
  }
  return out;
}

/** The lib files reachable from `entry` through `/// <reference lib>`. */
function libFiles(entry) {
  const libDir = path.dirname(require.resolve('typescript/lib/lib.d.ts'));
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(path.join(libDir, file), 'utf8');
    for (const match of text.matchAll(/\/\/\/\s*<reference\s+lib="([^"]+)"/g)) visit(`lib.${match[1]}.d.ts`);
  };
  visit(entry);
  return [...seen].map((file) => path.join(libDir, file));
}

function typesDir(pkg) {
  return path.join(NODE_MODULES, '@types', pkg);
}

function dtsFiles(dir, { recursive = false } = {}) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !['ts5.6', 'ts5.7', 'compatibility', 'web-globals'].includes(entry.name)) out.push(...dtsFiles(full, { recursive }));
    } else if (entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

module.exports = { Scope, parseFiles, findInterface, flatMembers, libFiles, typesDir, dtsFiles };
