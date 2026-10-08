/**
 * Library profile generators. Each reads the library's own machine-readable
 * API description — type declarations, type stubs, reference-assembly docs,
 * class files — and returns its names. The profile spec
 * (`profiles/<id>.js`) only sets rules: which modules or packages count,
 * which types' members are recognised on any receiver (`valueTypes`), whose
 * members are option keys (`optionTypes`), and the few single-word names a
 * library is known by (`keep`).
 */

const path = require('path');
const { isDistinctive, cleanNames, packageVersion, matchesModule } = require('./common');
const { zipEntries } = require('./extract/archive');
const { parseFiles, flatMembers, typesDir, dtsFiles } = require('./extract/ts-syntax');
const { packageApi, typesEntry, packageDir } = require('./extract/dts');
const { parsePyi, flatPyMembers } = require('./extract/pyi');
const { loadClasses, flatJavaMembers, splitName, isPublic, isStatic } = require('./extract/classfile');
const { dotnetDocs, dotnetTypesByName, dotnetTypeNames, dotnetMember, sourceLabel, TYPESHED } = require('./languages');
const { cachedPath } = require('./sources');
const fs = require('fs');

const text = (entry) => entry.data.toString('utf8');

/** Single-word names pass when the spec keeps them. */
const keeper = (spec) => {
  const keep = new Set(spec.keep ?? []);
  return (name) => keep.has(name) || isDistinctive(name);
};

// --- npm type declarations ---------------------------------------------------------

/**
 * A package's exports: classes always (a library type), functions and
 * types when distinctive or kept; `functions: 'all'` keeps every function
 * (RxJS operators are single words by design).
 */
function tsProfile(spec, { entries, dirs, packages }) {
  const api = packageApi(entries, dirs);
  const pass = keeper(spec);
  const exclude = new Set(spec.exclude ?? []);
  const globals = new Set();
  const types = new Set();
  for (const [name, entry] of api.exports) {
    if (exclude.has(name)) continue;
    if (entry.isClass) {
      types.add(name);
      continue;
    }
    if (entry.isFunction && (spec.functions === 'all' || pass(name))) globals.add(name);
    else if (entry.isValue && pass(name)) globals.add(name);
    if (entry.isType && pass(name)) types.add(name);
  }
  const members = {};
  for (const owner of [...(spec.valueTypes ?? []), ...(spec.optionTypes ?? [])]) {
    members[owner] = api.membersOf(owner) ?? api.membersOfDeclared(owner);
  }
  return {
    sources: packages.map((pkg) => `${pkg}@${packageVersion(pkg)}`),
    globals,
    types,
    members,
  };
}

// --- Python stubs -------------------------------------------------------------------

/** Parsed `.pyi` modules of a wheel or a directory, keyed by module path (`pandas.core.frame`). */
function pyiModules(files) {
  const modules = new Map();
  for (const { name, data } of files) {
    const module = name.replace(/\.pyi$/, '').replace(/\/__init__$/, '').replace(/-stubs(?=\/|$)/, '').split('/').join('.');
    modules.set(module, parsePyi(data.toString('utf8')));
  }
  return modules;
}

function pyiDirectory(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.pyi')) out.push({ name: path.relative(dir, full).split(path.sep).join('/'), data: fs.readFileSync(full) });
    }
  };
  walk(dir);
  return out;
}

/** All classes of the given modules in one map (bases resolve across them). */
function pyClasses(modules, patterns) {
  const classes = new Map();
  for (const [name, module] of modules) {
    if (!matchesModule(name, patterns)) continue;
    for (const [className, cls] of module.classes) {
      const existing = classes.get(className);
      if (existing) for (const member of cls.members) existing.members.add(member);
      else classes.set(className, { members: new Set(cls.members), bases: cls.bases });
    }
  }
  return classes;
}

/**
 * A Python library profile: `functions` (module → globals), `classes`
 * (module prefixes whose classes are types), `valueTypes` (class names),
 * `kwargs` (where parameter names become option keys: module prefixes,
 * plus the value types' methods).
 */
function pyProfile(spec, modules, sources) {
  const pass = keeper(spec);
  const globals = new Set();
  for (const module of spec.functionsFrom ?? []) {
    for (const name of modules.get(module)?.functions ?? []) if (!name.startsWith('_')) globals.add(name);
  }
  const typeClasses = pyClasses(modules, spec.classesFrom ?? []);
  const types = [...typeClasses.keys()].filter((name) => !name.startsWith('_') && pass(name));
  const memberClasses = pyClasses(modules, spec.membersFrom ?? spec.classesFrom ?? []);
  const members = {};
  for (const owner of spec.valueTypes ?? []) members[owner] = flatPyMembers(memberClasses, owner);
  if (spec.kwargsFrom) {
    const params = new Set();
    for (const [name, module] of modules) {
      if (matchesModule(name, spec.kwargsFrom)) for (const param of module.params) params.add(param);
    }
    members[`${spec.id}.kwargs`] = [...params].filter((name) => /^[a-z][a-z0-9_]*$/.test(name));
  }
  return { sources, globals, types, members, optionTypes: spec.kwargsFrom ? [`${spec.id}.kwargs`] : [] };
}

// --- .NET reference docs ------------------------------------------------------------

/**
 * A .NET library profile: types of `namespaces` (prefixes), the members and
 * extension methods of `valueTypes` (full names without arity), and as
 * `globals` the methods of `bareCallTypes` (`ControllerBase.Ok` is called as
 * `Ok(…)` inside a controller) plus their distinctive properties.
 */
function dotnetProfile(spec, ids) {
  const parsed = dotnetDocs(ids);
  const byName = dotnetTypesByName(parsed);
  const pass = keeper(spec);
  const inNamespace = (ns) => matchesModule(ns, spec.typeNamespaces);
  const types = [...dotnetTypeNames(parsed, inNamespace, () => false), ...[...parsed.types.values()].filter((type) => inNamespace(type.ns) && (spec.keep ?? []).includes(type.name)).map((type) => type.name)];
  const members = {};
  for (const owner of spec.valueTypes ?? []) {
    const simple = owner.split('.').pop();
    members[simple] = [...(byName.get(owner) ?? []), ...(parsed.extensions.get(simple) ?? [])].filter(dotnetMember);
  }
  // Methods are kept whatever their name (`Ok(…)`, `File(…)`); properties only when
  // distinctive — a controller's `User`, `Url`, `Request` are too generic.
  const methods = dotnetTypesByName(parsed, { methodsOnly: true });
  const globals = new Set();
  for (const owner of spec.bareCallTypes ?? []) {
    for (const name of byName.get(owner) ?? []) {
      if (dotnetMember(name) && (methods.get(owner)?.has(name) || pass(name))) globals.add(name);
    }
  }
  return {
    sources: ids.map(sourceLabel),
    globals,
    types,
    members,
    valueTypes: (spec.valueTypes ?? []).map((owner) => owner.split('.').pop()),
  };
}

// --- Java class files ---------------------------------------------------------------

/**
 * A JVM library profile: public types of `packages` (prefixes), public
 * static methods of `staticImportTypes` as globals (`assertEquals`,
 * `mock`), and the members of `valueTypes` (internal names, supertypes
 * followed across all loaded jars).
 */
function jvmProfile(spec, ids) {
  const classes = loadClasses(ids.flatMap((id) => zipEntries(cachedPath(id), (name) => name.endsWith('.class'))));
  const pass = keeper(spec);
  const types = new Set();
  for (const [internal, cls] of classes) {
    const { pkg, simple, outer } = splitName(internal);
    if (!isPublic(cls.access) || outer.length > 0 || !matchesModule(pkg, spec.packages)) continue;
    // Implementation scaffolding (`AbstractListAssert`, `…Impl`) is not written in user code.
    if (/^Abstract|Impl$/.test(simple) || (spec.excludeTypes && new RegExp(spec.excludeTypes).test(simple))) continue;
    if (pass(simple)) types.add(simple);
  }
  const globals = new Set();
  for (const internal of spec.staticImportTypes ?? []) {
    for (const method of classes.get(internal)?.methods ?? []) {
      if (isPublic(method.flags) && isStatic(method.flags) && /^[a-z]\w*$/.test(method.name)) globals.add(method.name);
    }
  }
  const members = {};
  for (const internal of spec.valueTypes ?? []) members[splitName(internal).qualified] = flatJavaMembers(classes, internal);
  return {
    sources: ids.map(sourceLabel),
    globals,
    types,
    members,
    valueTypes: (spec.valueTypes ?? []).map((internal) => splitName(internal).qualified),
  };
}

// --- The generators ------------------------------------------------------------------

const NODE_TYPES = (pkg) => `@types/${pkg}@${packageVersion(`@types/${pkg}`)} (MIT)`;

const GENERATORS = {
  // @types packages read at syntax level (their shapes are simple and stable).
  jquery: {
    needs: [],
    build() {
      const root = parseFiles(dtsFiles(typesDir('jquery')));
      const ns = root.namespaces.get('JQuery');
      return {
        sources: [NODE_TYPES('jquery')],
        globals: ['$', 'jQuery'],
        types: [...root.types].filter((name) => name.startsWith('JQuery') || name.startsWith('BaseJQuery')),
        members: {
          $: flatMembers([root], 'JQueryStatic'),
          JQuery: flatMembers([root], 'JQuery'),
          'JQuery.AjaxSettings': [...flatMembers([ns], 'AjaxSettings'), ...flatMembers([ns], 'UrlAjaxSettings')],
          'JQuery.EffectsOptions': flatMembers([ns], 'EffectsOptions'),
        },
        valueTypes: ['JQuery'],
        optionTypes: ['JQuery.AjaxSettings', 'JQuery.EffectsOptions'],
      };
    },
  },
  react: {
    needs: [],
    build() {
      const react = parseFiles(dtsFiles(typesDir('react'))).namespaces.get('React');
      return {
        sources: [NODE_TYPES('react')],
        globals: ['React', ...[...react.values.keys()].filter(isDistinctive)],
        types: ['JSX', ...[...react.types].filter(isDistinctive)],
        members: {},
      };
    },
  },
  lodash: {
    needs: [],
    build() {
      return { sources: [NODE_TYPES('lodash')], globals: ['_'], types: ['LoDashStatic'], members: {} };
    },
  },
  node: {
    needs: [],
    build(spec) {
      const root = parseFiles(dtsFiles(typesDir('node'), { recursive: true }));
      const exclude = new Set(spec.exclude ?? []);
      const modules = [...root.namespaces.keys()]
        .filter((key) => key.startsWith('"'))
        .map((key) => key.slice(1, -1))
        .filter((name) => !name.startsWith('node:') && !name.includes('/') && !exclude.has(name));
      return {
        sources: [NODE_TYPES('node')],
        globals: ['process', 'Buffer', '__dirname', '__filename', 'require', 'module', 'exports', 'global', 'setImmediate', 'clearImmediate'],
        types: ['NodeJS', 'Buffer'],
        namespaces: modules,
        members: {},
      };
    },
  },

  // npm packages resolved with the TypeScript checker.
  express: {
    needs: [],
    build(spec) {
      const core = tsProfile(spec, {
        entries: [typesEntry('@types/express-serve-static-core')],
        dirs: [packageDir('@types/express-serve-static-core')],
        packages: ['@types/express-serve-static-core'],
      });
      return { ...core, sources: [...core.sources, `@types/express@${packageVersion('@types/express')}`].map((s) => `${s} (MIT)`), globals: ['express'] };
    },
  },
  angular: {
    needs: [],
    build(spec) {
      const packages = ['@angular/core', '@angular/common', '@angular/router', '@angular/forms'];
      const result = tsProfile(spec, {
        entries: [...packages.map((pkg) => typesEntry(pkg)), typesEntry('@angular/common', 'types/http.d.ts')],
        dirs: packages.map(packageDir),
        packages,
      });
      return { ...result, sources: result.sources.map((s) => `${s} (MIT)`) };
    },
  },
  vue: {
    needs: [],
    build(spec) {
      const result = tsProfile(spec, {
        entries: [typesEntry('vue'), typesEntry('vue-router')],
        dirs: ['vue', '@vue/runtime-core', '@vue/runtime-dom', '@vue/reactivity', '@vue/shared', 'vue-router'].map(packageDir),
        packages: ['vue', 'vue-router'],
      });
      return { ...result, sources: result.sources.map((s) => `${s} (MIT)`) };
    },
  },
  rxjs: {
    needs: [],
    build(spec) {
      const result = tsProfile(spec, {
        entries: [typesEntry('rxjs', 'dist/types/index.d.ts'), typesEntry('rxjs', 'dist/types/operators/index.d.ts')],
        dirs: [packageDir('rxjs')],
        packages: ['rxjs'],
      });
      return { ...result, sources: result.sources.map((s) => `${s} (Apache-2.0)`) };
    },
  },

  // Python type stubs.
  requests: {
    needs: [],
    build(spec) {
      const modules = pyiModules(pyiDirectory(path.join(TYPESHED, 'stubs', 'requests')));
      return pyProfile(spec, modules, [`typeshed stubs/requests via pyright@${packageVersion('pyright')} (Apache-2.0)`]);
    },
  },
  numpy: {
    needs: ['pypi:numpy'],
    build(spec) {
      const modules = pyiModules(zipEntries(cachedPath('pypi:numpy'), (name) => /^numpy\/.*\.pyi$/.test(name) && !/\/tests?\//.test(name)));
      return pyProfile(spec, modules, [sourceLabel('pypi:numpy')]);
    },
  },
  pandas: {
    needs: ['pypi:pandas-stubs'],
    build(spec) {
      const modules = pyiModules(zipEntries(cachedPath('pypi:pandas-stubs'), (name) => name.endsWith('.pyi')));
      return pyProfile(spec, modules, [sourceLabel('pypi:pandas-stubs')]);
    },
  },
  django: {
    needs: ['pypi:django-stubs'],
    build(spec) {
      const modules = pyiModules(zipEntries(cachedPath('pypi:django-stubs'), (name) => name.endsWith('.pyi')));
      return pyProfile(spec, modules, [sourceLabel('pypi:django-stubs')]);
    },
  },

  // .NET reference-assembly docs.
  linq: {
    needs: ['nuget:microsoft.netcore.app.ref'],
    build(spec) {
      const parsed = dotnetDocs(['nuget:microsoft.netcore.app.ref']);
      const byName = dotnetTypesByName(parsed);
      const operators = [...(byName.get('System.Linq.Enumerable') ?? []), ...(byName.get('System.Linq.Queryable') ?? [])].filter(dotnetMember);
      return {
        sources: [sourceLabel('nuget:microsoft.netcore.app.ref')],
        types: [...parsed.types.values()].filter((type) => type.ns === 'System.Linq').map((type) => type.name),
        members: { IEnumerable: operators, IGrouping: byName.get('System.Linq.IGrouping') ?? [] },
        valueTypes: ['IEnumerable', 'IGrouping'],
      };
    },
  },
  aspnetcore: {
    needs: ['nuget:microsoft.aspnetcore.app.ref'],
    build: (spec) => dotnetProfile(spec, ['nuget:microsoft.aspnetcore.app.ref']),
  },
  efcore: {
    needs: ['nuget:microsoft.entityframeworkcore', 'nuget:microsoft.entityframeworkcore.relational', 'nuget:microsoft.entityframeworkcore.sqlserver'],
    build: (spec) => dotnetProfile(spec, ['nuget:microsoft.entityframeworkcore', 'nuget:microsoft.entityframeworkcore.relational', 'nuget:microsoft.entityframeworkcore.sqlserver']),
  },

  // Java class files.
  spring: {
    needs: ['spring-core', 'spring-beans', 'spring-context', 'spring-web', 'spring-webmvc', 'spring-webflux', 'spring-tx', 'spring-jdbc', 'spring-test', 'spring-data-commons', 'spring-data-jpa', 'spring-boot'].map((a) => `maven:${a}`),
    build(spec) {
      return jvmProfile(spec, this.needs);
    },
  },
  junit: {
    needs: ['junit-jupiter-api', 'junit-jupiter-params', 'mockito-core', 'assertj-core'].map((a) => `maven:${a}`),
    build(spec) {
      return jvmProfile(spec, this.needs);
    },
  },
};

module.exports = { GENERATORS, cleanNames };
