const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildModelManifest } = require('../../scripts/hf-model/stage-hf-model');

describe('buildModelManifest', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-model-'));
    fs.mkdirSync(path.join(dir, 'onnx'));
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');
    fs.writeFileSync(path.join(dir, 'onnx', 'model.onnx'), 'weights');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('lists every file with size and SHA-256 and derives a stable version', () => {
    const manifest = buildModelManifest(dir, ['config.json', path.join('onnx', 'model.onnx')]);
    expect(manifest.format).toBe(1);
    expect(manifest.files).toEqual([
      { path: 'config.json', size: 2, sha256: crypto.createHash('sha256').update('{}').digest('hex') },
      { path: 'onnx/model.onnx', size: 7, sha256: crypto.createHash('sha256').update('weights').digest('hex') },
    ]);
    expect(manifest.version).toMatch(/^[0-9a-f]{16}$/);
    expect(buildModelManifest(dir, ['config.json', path.join('onnx', 'model.onnx')]).version).toBe(manifest.version);

    fs.writeFileSync(path.join(dir, 'onnx', 'model.onnx'), 'new weights');
    expect(buildModelManifest(dir, ['config.json', path.join('onnx', 'model.onnx')]).version).not.toBe(manifest.version);
  });
});
