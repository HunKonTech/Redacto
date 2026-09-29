// Build the Visual Studio 2022 extension (.vsix) around dist-ide/webview.
// Output: release/ide/redacto-visualstudio-<version>.vsix — for
// manual installation only; nothing here publishes to the Marketplace.
// Windows only: needs MSBuild with the "Visual Studio extension development"
// workload (VSSDK) on PATH.
const fs = require('fs');
const path = require('path');
const { ROOT, OUT_DIR, version, copyWebview, run } = require('./common');

const dir = path.join(ROOT, 'ide', 'visualstudio', 'PrivacyGuardrail.VisualStudio');
const ver = version();

copyWebview(path.join(dir, 'webview'));
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(dir, 'LICENSE'));
fs.copyFileSync(path.join(ROOT, 'src', 'assets', 'icons', 'icon128.png'), path.join(dir, 'icon.png'));

const manifestPath = path.join(dir, 'source.extension.vsixmanifest');
const manifest = fs.readFileSync(manifestPath, 'utf8');
fs.writeFileSync(manifestPath, manifest.replace(/(<Identity [^>]*Version=")[^"]*(")/, `$1${ver}$2`));

run('msbuild PrivacyGuardrail.VisualStudio.csproj /restore /p:Configuration=Release /p:DeployExtension=false /v:minimal', dir);

const built = path.join(dir, 'bin', 'Release', 'PrivacyGuardrail.VisualStudio.vsix');
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `redacto-visualstudio-${ver}.vsix`);
fs.copyFileSync(built, out);
console.log(`[ide] ${path.relative(ROOT, out)}`);
