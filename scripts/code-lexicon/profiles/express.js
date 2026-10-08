/** Express: generated from @types/express-serve-static-core. */
module.exports = {
  id: 'express',
  languages: ['javascript', 'typescript'],
  generate: 'express',
  signals: [
    String.raw`\brequire\(\s*['"]express['"]\s*\)`,
    String.raw`\bfrom\s+['"]express['"]`,
    String.raw`\bexpress\.(?:Router|json|static|urlencoded)\s*\(`,
    String.raw`\b(?:app|router)\.(?:get|post|put|patch|delete|use|all|route)\(\s*['"\x60]/`,
  ],
  valueTypes: ['Request', 'Response', 'Application', 'Router'],
};
