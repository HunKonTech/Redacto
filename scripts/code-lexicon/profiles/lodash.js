/** Lodash / Underscore: the `_` namespace and its functions, from @types/lodash. */
module.exports = {
  id: 'lodash',
  languages: ['javascript', 'typescript'],
  generate: 'lodash',
  signals: [
    String.raw`(?<![\w$])_\.[a-zA-Z]\w*\s*\(`,
    String.raw`\bfrom\s+['"](?:lodash(?:-es)?|underscore)(?:[/.][\w/.]+)?['"]`,
    String.raw`\brequire\(\s*['"](?:lodash|underscore)`,
  ],
};
