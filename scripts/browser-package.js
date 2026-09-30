/**
 * Shared build-and-stage step for the per-browser packages (Edge, Firefox).
 * Every browser builds from the same sources; a target only names its output
 * and, for Firefox, switches the webpack build to the Firefox manifest.
 *
 *   release/<target>/redacto-<target>-<version>/      unpacked
 *   release/<target>/redacto-<target>-<version>.zip   store / release upload
 *   release/<target>/redacto-<target>-<version>.sha256
 *
 * The package contents go through the same filter as the Chrome release
 * package (no source maps, no nested manifest.json, required legal files).
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const { ciBuildVersion } = require('./build-number');
const { missingPreparedModelAssets } = require('./extension-packaging');
const { listPackageEntries, readPackageVersion, sha256File } = require('./package-release');

const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv, usage) {
  const options = { skipBuild: false, requireModel: false };
  for (const arg of argv) {
    if (arg === '--skip-build') options.skipBuild = true;
    else if (arg === '--require-model') options.requireModel = true;
    else throw new Error(`Unknown option: ${arg}\nUsage: ${usage} [--skip-build] [--require-model]`);
  }
  return options;
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return childProcess.spawnSync(probe, [command], { stdio: 'ignore' }).status === 0;
}

function run(label, command, args, env = {}) {
  console.log(`\n> ${label}`);
  const result = childProcess.spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function assertBuildTools() {
  const missing = [];
  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) missing.push('node_modules (run `npm install`)');
  if (!commandExists('cargo')) missing.push('cargo (install Rust from https://rustup.rs)');
  if (!commandExists('wasm-bindgen')) missing.push('wasm-bindgen (run `cargo install wasm-bindgen-cli --version 0.2.118`)');
  if (missing.length > 0) {
    throw new Error(`Missing build prerequisites:\n${missing.map((item) => `  - ${item}`).join('\n')}`);
  }
}

function build(target, options) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  assertBuildTools();
  run('WASM build', npm, ['run', 'build:wasm']);
  run('Extension build', npm, ['run', 'build:ext'], {
    ...target.buildEnv,
    ...(options.requireModel ? { NER_MODEL_ASSETS_REQUIRED: '1' } : {}),
  });
}

function stage(target, version) {
  const outputDir = path.join(ROOT_DIR, 'release', target.name);
  const { entries, excluded } = listPackageEntries(path.join(ROOT_DIR, target.distDir));
  const baseName = `redacto-${target.name}-${version}`;
  const unpackedDir = path.join(outputDir, baseName);
  const zipPath = path.join(outputDir, `${baseName}.zip`);
  const checksumPath = path.join(outputDir, `${baseName}.sha256`);

  fs.rmSync(unpackedDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.mkdirSync(unpackedDir, { recursive: true });

  const zip = new AdmZip();
  for (const entry of entries) {
    const destination = path.join(unpackedDir, entry.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(entry.absolutePath, destination);
    zip.addFile(entry.relativePath, fs.readFileSync(entry.absolutePath));
  }
  zip.writeZip(zipPath);
  const checksum = sha256File(zipPath);
  fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(zipPath)}\n`);

  return { unpackedDir, zipPath, checksum, fileCount: entries.length, excludedCount: excluded.length };
}

/**
 * @param {object} target
 * @param {string} target.name      package name suffix and release/ subfolder
 * @param {string} target.label     browser name for log output
 * @param {string} target.distDir   webpack output folder of this build
 * @param {object} [target.buildEnv] extra env for `npm run build:ext`
 * @param {string} target.usage     command line shown on bad arguments
 * @param {string} target.installHint how to load the unpacked folder
 */
function buildBrowserPackage(target, argv) {
  const options = parseArgs(argv, target.usage);
  const packageVersion = readPackageVersion(ROOT_DIR);
  const version = ciBuildVersion(packageVersion) ?? packageVersion;

  const missingModel = missingPreparedModelAssets(ROOT_DIR);
  if (missingModel.length > 0) {
    if (options.requireModel) {
      throw new Error(
        `Local AI model assets are missing (${missingModel.join(', ')}). See docs/developer/model-assets.md.`
      );
    }
    console.warn(
      '\nNote: Local AI model assets are not prepared, so this build runs pattern-only detection ' +
        '(secrets, emails, IBANs, ...). See docs/developer/model-assets.md to include Local AI.'
    );
  }

  if (!options.skipBuild) build(target, options);
  const result = stage(target, version);

  console.log(`\n${target.label} build ready (${result.fileCount} files, ${result.excludedCount} excluded):`);
  console.log(`  Unpacked: ${path.relative(ROOT_DIR, result.unpackedDir)}`);
  console.log(`  Zip:      ${path.relative(ROOT_DIR, result.zipPath)}`);
  console.log(`  SHA-256:  ${result.checksum}`);
  console.log(`\nInstall: ${target.installHint}`);
  console.log(`  ${result.unpackedDir}`);
  return result;
}

function runCli(target) {
  try {
    buildBrowserPackage(target, process.argv.slice(2));
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildBrowserPackage, parseArgs, runCli };
