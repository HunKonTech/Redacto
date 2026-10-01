#!/usr/bin/env node

/**
 * Build Redacto for Firefox.
 *
 * Same sources as the Chrome build; webpack switches to the Firefox manifest
 * (scripts/firefox/firefox-manifest.js) and writes to `dist-firefox/`:
 *
 *   release/firefox/redacto-firefox-<version>/      unpacked
 *   release/firefox/redacto-firefox-<version>.zip   for addons.mozilla.org
 *   release/firefox/redacto-firefox-<version>.sha256
 *
 * Usage: node scripts/firefox/build-firefox.js [--skip-build] [--require-model]
 */

const { runCli } = require('../browser-package');

const FIREFOX_TARGET = {
  name: 'firefox',
  label: 'Firefox',
  distDir: 'dist-firefox',
  buildEnv: { BROWSER: 'firefox' },
  usage: 'node scripts/firefox/build-firefox.js',
  installHint: 'open about:debugging#/runtime/this-firefox, click "Load Temporary Add-on…", and pick manifest.json in',
};

if (require.main === module) runCli(FIREFOX_TARGET);

module.exports = { FIREFOX_TARGET };
