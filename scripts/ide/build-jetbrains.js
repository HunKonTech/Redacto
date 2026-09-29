// Build the JetBrains plugin (.zip) around dist-ide/webview.
// Output: release/ide/redacto-jetbrains-<version>.zip — for
// "Install Plugin from Disk…" only; no publishing task is configured.
// Needs JDK 21 (the Gradle wrapper fetches Gradle and the IntelliJ Platform).
const fs = require('fs');
const path = require('path');
const { ROOT, OUT_DIR, version, run } = require('./common');

const dir = path.join(ROOT, 'ide', 'jetbrains');
const ver = version();
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

run(`${gradlew} --no-daemon buildPlugin -PpluginVersion=${ver}`, dir);

const distributions = path.join(dir, 'build', 'distributions');
const zip = fs.readdirSync(distributions).find((name) => name.endsWith('.zip'));
if (!zip) throw new Error(`No plugin zip in ${distributions}`);
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `redacto-jetbrains-${ver}.zip`);
fs.copyFileSync(path.join(distributions, zip), out);
console.log(`[ide] ${path.relative(ROOT, out)}`);
