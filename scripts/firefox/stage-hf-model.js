#!/usr/bin/env node

/**
 * Stages the prepared Local AI model for its Hugging Face repository, where
 * the Firefox build downloads it from (src/background/local-ai-model-downloader.ts):
 *
 *   <out>/config.json, tokenizer*.json, onnx/model_q4f16.onnx(.data)
 *   <out>/redacto-model.json   size + SHA-256 of every file, and a version
 *   <out>/README.md            model card (source, license, conversion)
 *
 * The version is derived from the file hashes, so an unchanged model stages
 * byte-identical files and the upload makes no new commit.
 *
 * Usage: node scripts/firefox/stage-hf-model.js --out <dir>
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  ACTIVE_PREPARED_MODEL_SOURCE_DIR,
  REQUIRED_MODEL_ASSETS,
  missingPreparedModelAssets,
} = require('../extension-packaging');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MANIFEST_FILE = 'redacto-model.json';

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function buildModelManifest(sourceDir, relativePaths) {
  const files = relativePaths.map((relativePath) => {
    const posixPath = relativePath.split(path.sep).join('/');
    const absolutePath = path.join(sourceDir, relativePath);
    return { path: posixPath, size: fs.statSync(absolutePath).size, sha256: sha256File(absolutePath) };
  });
  const version = crypto
    .createHash('sha256')
    .update(files.map((file) => `${file.path}:${file.sha256}`).join('\n'))
    .digest('hex')
    .slice(0, 16);
  return { format: 1, version, files };
}

const MODEL_CARD = `---
license: apache-2.0
base_model: bardsai/eu-pii-anonimization-multilang
library_name: transformers.js
pipeline_tag: token-classification
tags:
  - pii
  - onnx
  - redacto
---

# Redacto Local AI model (q4f16 ONNX)

The PII token-classification model that the [Redacto](https://github.com/HunKonTech/Redacto)
browser extension runs locally. The Firefox add-on downloads it from here on first use
(addons.mozilla.org does not accept packages over 200 MB); the Chrome and Edge packages
ship the same files.

- Source model: [bardsai/eu-pii-anonimization-multilang](https://huggingface.co/bardsai/eu-pii-anonimization-multilang) (Apache-2.0, DOI 10.57967/hf/8721)
- Changes: converted to ONNX fp16, then 4-bit MatMulNBits weight-only quantization (block size 32, symmetric), ONNX external-data format. These are not the upstream-original files.
- \`redacto-model.json\` lists every file with its size and SHA-256; the extension verifies each download against it.

Uploaded by Redacto's release workflow. See the repository's \`THIRD_PARTY_NOTICES.md\` and \`docs/developer/model-assets.md\`.
`;

function stageHfModel(outDir, rootDir = ROOT_DIR) {
  const missing = missingPreparedModelAssets(rootDir);
  if (missing.length > 0) {
    throw new Error(`Local AI model assets are missing (${missing.join(', ')}). See docs/developer/model-assets.md.`);
  }
  const sourceDir = path.join(rootDir, ACTIVE_PREPARED_MODEL_SOURCE_DIR);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const relativePath of REQUIRED_MODEL_ASSETS) {
    const destination = path.join(outDir, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceDir, relativePath), destination);
  }
  const manifest = buildModelManifest(sourceDir, REQUIRED_MODEL_ASSETS);
  fs.writeFileSync(path.join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'README.md'), MODEL_CARD);
  return manifest;
}

function main(argv = process.argv.slice(2)) {
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  if (!outDir) throw new Error('Usage: node scripts/firefox/stage-hf-model.js --out <dir>');
  const manifest = stageHfModel(path.resolve(outDir));
  const totalMb = manifest.files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024);
  console.log(`Staged model version ${manifest.version} (${manifest.files.length} files, ${totalMb.toFixed(1)} MB) in ${outDir}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { MANIFEST_FILE, buildModelManifest, stageHfModel };
