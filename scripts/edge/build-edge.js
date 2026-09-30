#!/usr/bin/env node

/**
 * Build Redacto for Microsoft Edge.
 *
 * Edge runs the same Manifest V3 extension as Chrome, so this builds the
 * regular `dist/` output and stages it for Edge:
 *
 *   release/edge/redacto-edge-<version>/      unpacked, for "Load unpacked"
 *   release/edge/redacto-edge-<version>.zip   for Edge Add-ons (Partner Center)
 *   release/edge/redacto-edge-<version>.sha256
 *
 * Usage: node scripts/edge/build-edge.js [--skip-build] [--require-model]
 */

const { runCli } = require('../browser-package');

const EDGE_TARGET = {
  name: 'edge',
  label: 'Edge',
  distDir: 'dist',
  usage: 'node scripts/edge/build-edge.js',
  installHint: 'open edge://extensions, turn on "Developer mode", click "Load unpacked", and select',
};

if (require.main === module) runCli(EDGE_TARGET);

module.exports = { EDGE_TARGET };
