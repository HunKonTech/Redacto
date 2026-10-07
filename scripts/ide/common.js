// Shared helpers for the IDE plugin builds (scripts/ide/build-*.js).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ciBuildVersion } = require('../build-number');

const ROOT = path.resolve(__dirname, '..', '..');
const WEBVIEW_DIR = path.join(ROOT, 'dist-ide', 'webview');
const OUT_DIR = path.join(ROOT, 'release', 'ide');

/**
 * The plugin version: the CI build version (`0.5.0.17`, as the browser
 * packages and the web page carry it), package.json's version outside CI.
 */
function version(env = process.env) {
  const packageVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  return ciBuildVersion(packageVersion, env) ?? packageVersion;
}

/**
 * VS Code needs a plain x.y.z version (the Marketplace rejects both a fourth
 * part and semver pre-release tags): the build number becomes the patch part
 * (`0.5.0.17` -> `0.5.17`). The run number only grows, so builds stay ordered
 * across base versions too; the base's own patch part is dropped.
 */
function semverVersion(ver) {
  const match = /^(\d+\.\d+)\.\d+\.(\d+)$/.exec(ver);
  return match ? `${match[1]}.${match[2]}` : ver;
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

const REPO = 'HunKonTech/Redacto';
const BRANCH = 'main';

/**
 * The root README with every relative link and image turned into an absolute
 * GitHub URL: the marketplaces render the README away from the repository,
 * where relative paths would be broken. Images (`.png`, `.svg`, ...) point to
 * raw.githubusercontent.com, everything else to github.com.
 */
function readmeMarkdown() {
  const absolute = (url) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) return url;
    const clean = url.replace(/^\.?\//, '');
    if (/\.(png|jpe?g|gif|svg|webp)$/i.test(clean)) {
      return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${clean}`;
    }
    const kind = /\/$|(^|\/)[^./]+$/.test(clean) ? 'tree' : 'blob';
    return `https://github.com/${REPO}/${kind}/${BRANCH}/${clean.replace(/\/$/, '')}`;
  };
  return fs
    .readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    .replace(/\]\(([^)\s]+)\)/g, (_, url) => `](${absolute(url)})`)
    .replace(/\b(src|href)="([^"]+)"/g, (_, attr, url) => `${attr}="${absolute(url)}"`)
    // <picture> (dark-mode logo) is not supported by every marketplace: keep its <img>.
    .replace(/<picture>[\s\S]*?(<img[^>]*>)[\s\S]*?<\/picture>/g, '$1');
}

/** The README as HTML (JetBrains plugin description). */
function readmeHtml() {
  const md = require('markdown-it')({ html: true, linkify: true });
  return md.render(readmeMarkdown().replace(/^# Redacto\s*$/m, '')) ;
}

/**
 * Write the marketplace README: the IDE-specific intro (`introFile`) followed
 * by the root README, to `dest`.
 */
function writeReadme(introFile, dest) {
  const intro = fs.readFileSync(introFile, 'utf8').trimEnd();
  fs.writeFileSync(dest, `${intro}\n\n---\n\n${readmeMarkdown()}`);
}

function run(command, cwd) {
  console.log(`[ide] ${path.relative(ROOT, cwd) || '.'}$ ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

module.exports = { ROOT, WEBVIEW_DIR, OUT_DIR, version, semverVersion, copyWebview, run, readmeMarkdown, readmeHtml, writeReadme };
