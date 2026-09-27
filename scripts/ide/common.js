// Shared helpers for the IDE plugin builds (scripts/ide/build-*.js).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WEBVIEW_DIR = path.join(ROOT, 'dist-ide', 'webview');
const OUT_DIR = path.join(ROOT, 'release', 'ide');

function version() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

function requireWebview() {
  if (!fs.existsSync(path.join(WEBVIEW_DIR, 'index.html'))) {
    throw new Error('dist-ide/webview is missing — run `npm run build:ide-webview` first.');
  }
}

/** Replace `dest` with a copy of the built panel. */
function copyWebview(dest) {
  requireWebview();
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(WEBVIEW_DIR, dest, { recursive: true });
}

function run(command, cwd) {
  console.log(`[ide] ${path.relative(ROOT, cwd) || '.'}$ ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

module.exports = { ROOT, WEBVIEW_DIR, OUT_DIR, version, copyWebview, run };
