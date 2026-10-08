/** Node.js runtime: globals and the core modules (fs, path, http…), from @types/node. */
module.exports = {
  id: 'node',
  languages: ['javascript', 'typescript'],
  generate: 'node',
  // Module names that are everyday words stay renameable when used on their own.
  exclude: ['test', 'domain', 'constants', 'module', 'sea', 'sqlite', 'inspector', 'trace_events', 'punycode', 'sys', 'wasi'],
  signals: [
    String.raw`\brequire\(\s*['"](?:node:)?(?:{{namespaces}})['"]\s*\)`,
    String.raw`\bfrom\s+['"](?:node:)?(?:{{namespaces}})(?:/promises)?['"]`,
    String.raw`\bprocess\.(?:env|argv|exit|cwd|platform|nextTick|stdout|stderr|stdin)\b`,
    String.raw`\b__(?:dirname|filename)\b`,
    String.raw`\bmodule\.exports\b`,
  ],
};
