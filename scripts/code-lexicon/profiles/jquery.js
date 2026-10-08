/** jQuery: names from @types/jquery; activated by its API shapes, also in 1-line fragments. */
module.exports = {
  id: 'jquery',
  languages: ['javascript', 'typescript'],
  generate: 'jquery',
  signals: [
    String.raw`\bjQuery\s*[.(]`,
    String.raw`\bJQuery(?:Static)?\b`,
    String.raw`\brequire\(\s*['"]jquery['"]\s*\)`,
    String.raw`\bfrom\s+['"]jquery['"]`,
    String.raw`(?<![\w$])\$\.(?:{{members:$}})\s*\(`,
    { all: [String.raw`(?<![\w$])\$\s*\(`, String.raw`\.(?:{{members:JQuery}})\s*\(`] },
  ],
};
