// Build the VS Code extension (.vsix) around dist-ide/webview.
// Output: release/ide/redacto-vscode-<version>.vsix — installable by hand;
// CI publishes this same file to the VS Code Marketplace.
const fs = require('fs');
const path = require('path');
const { ROOT, OUT_DIR, version, semverVersion, copyWebview, run, writeReadme } = require('./common');

const dir = path.join(ROOT, 'ide', 'vscode');
const ver = version();

copyWebview(path.join(dir, 'webview'));
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(dir, 'LICENSE'));
writeReadme(path.join(dir, 'README.ide.md'), path.join(dir, 'README.md'));
fs.copyFileSync(path.join(ROOT, 'src', 'assets', 'icons', 'icon128.png'), path.join(dir, 'icon.png'));

run('npm ci --no-audit --no-fund', dir);
run('npm run compile', dir);
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `redacto-vscode-${ver}.vsix`);
run(
  `npx vsce package ${semverVersion(ver)} --no-git-tag-version --no-update-package-json --no-dependencies --out "${out}"`,
  dir,
);
console.log(`[ide] ${path.relative(ROOT, out)}`);
