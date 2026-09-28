/**
 * Runs the identifier-classifier provider against the real prepared ONNX
 * model (no mocked pipeline). Needs `npm run prepare:model:identifier-classifier`
 * first.
 *
 * The provider is compiled from TypeScript with `tsc` and exercised in a
 * child `node` process rather than inside Jest: onnxruntime-node rejects
 * tensors built from typed arrays of Jest's sandboxed realm.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MODEL_ROOT = path.join(REPO_ROOT, 'generated');
const MODEL_DIR = path.join(MODEL_ROOT, 'models', 'identifier-classifier');

function compileProvider(outDir) {
  const tsc = require.resolve('typescript/bin/tsc', { paths: [REPO_ROOT] });
  try {
    execFileSync(
      process.execPath,
      [
        tsc,
        path.join(REPO_ROOT, 'src', 'offscreen', 'identifier-classifier-provider.ts'),
        '--outDir', outDir,
        '--rootDir', path.join(REPO_ROOT, 'src'),
        '--module', 'commonjs',
        '--moduleResolution', 'node',
        '--target', 'ES2022',
        '--esModuleInterop',
        '--skipLibCheck',
        '--noCheck',
      ],
      { cwd: REPO_ROOT, stdio: 'pipe' }
    );
  } catch (err) {
    throw new Error(`tsc failed:\n${err.stdout}${err.stderr}`);
  }
  return path.join(outDir, 'offscreen', 'identifier-classifier-provider.js');
}

function runClassify(providerPath, texts) {
  const script = `
    const fs = require('fs');
    const path = require('path');
    const { createIdentifierClassifierProvider } = require(${JSON.stringify(providerPath)});
    const modelRoot = ${JSON.stringify(MODEL_ROOT)};
    const transformersPath = require.resolve('@huggingface/transformers', { paths: [${JSON.stringify(REPO_ROOT)}] });
    const provider = createIdentifierClassifierProvider({
      deviceOverride: 'cpu',
      getExtensionUrl: (p) => path.join(modelRoot, p),
      assetExists: async (file) => fs.existsSync(file),
      loadTransformers: async () => require(transformersPath),
    });
    provider.classify(${JSON.stringify(texts)}).then(({ classifications, available }) => {
      process.stdout.write(JSON.stringify({ available, classifications: Object.fromEntries(classifications) }));
    }, (err) => { console.error(err); process.exit(1); });
  `;
  const stdout = execFileSync(process.execPath, ['-e', script], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  return JSON.parse(stdout.toString());
}

describe('identifier-classifier against the real ONNX model', () => {
  let tmpDir;
  let providerPath;

  beforeAll(() => {
    if (!fs.existsSync(path.join(MODEL_DIR, 'onnx', 'model_quantized.onnx'))) {
      throw new Error(
        `No prepared model at ${path.relative(REPO_ROOT, MODEL_DIR)}; run 'npm run prepare:model:identifier-classifier' first.`
      );
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-identifier-classifier-'));
    providerPath = compileProvider(tmpDir);
  }, 120_000);

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loads the model and classifies identifiers in a code snippet', () => {
    const snippet = [
      "import { useState } from 'react';",
      '',
      'function calculateInvoiceTotalForCustomer(invoiceLineItems) {',
      '  const [discountRateOverride, setDiscountRateOverride] = useState(0);',
      '  const subtotalBeforeTax = invoiceLineItems.reduce((sum, item) => sum + item.amount, 0);',
      '  console.log(subtotalBeforeTax);',
      '  return subtotalBeforeTax * (1 - discountRateOverride);',
      '}',
    ].join('\n');

    const { available, classifications } = runClassify(providerPath, [snippet]);

    expect(available).toBe(true);
    expect(Object.keys(classifications).length).toBeGreaterThan(0);
    for (const verdict of Object.values(classifications)) {
      expect(['OWN', 'LIB']).toContain(verdict);
    }
    // Project-specific names declared right in the snippet must never be
    // treated as library names (they would then escape renaming).
    expect(classifications.calculateInvoiceTotalForCustomer).toBe('OWN');
    expect(classifications.subtotalBeforeTax).toBe('OWN');
  }, 180_000);
});
