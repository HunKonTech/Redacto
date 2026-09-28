const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  downloadFromHuggingFace,
  isNeededRepoFile,
} = require('../../scripts/prepare-identifier-classifier-model');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(String(body)).buffer,
  };
}

describe('identifier-classifier download', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-idc-'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test('keeps only the quantized ONNX export', () => {
    expect(isNeededRepoFile('onnx/model_quantized.onnx')).toBe(true);
    expect(isNeededRepoFile('onnx/model.onnx')).toBe(false);
    expect(isNeededRepoFile('tokenizer.json')).toBe(true);
    expect(isNeededRepoFile('.gitattributes')).toBe(false);
  });

  test('downloads a public repo over HTTPS without the hf CLI', async () => {
    const requested = [];
    const fetchImpl = async (url, init) => {
      requested.push({ url, headers: init.headers });
      if (url.endsWith('/api/models/owner/repo')) {
        return response({
          siblings: [
            { rfilename: 'config.json' },
            { rfilename: 'onnx/model.onnx' },
            { rfilename: 'onnx/model_quantized.onnx' },
          ],
        });
      }
      return response(`contents of ${url.split('/resolve/main/')[1]}`);
    };

    await downloadFromHuggingFace('owner/repo', dir, { fetchImpl, token: undefined });

    expect(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).toBe('contents of config.json');
    expect(fs.existsSync(path.join(dir, 'onnx', 'model_quantized.onnx'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'onnx', 'model.onnx'))).toBe(false);
    expect(requested.map((r) => r.url)).toContain(
      'https://huggingface.co/owner/repo/resolve/main/onnx/model_quantized.onnx',
    );
    expect(requested.every((r) => !('Authorization' in r.headers))).toBe(true);
  });

  test('sends HF_TOKEN as the access token when given', async () => {
    const headers = [];
    const fetchImpl = async (url, init) => {
      headers.push(init.headers);
      return url.includes('/api/models/') ? response({ siblings: [{ rfilename: 'config.json' }] }) : response('{}');
    };

    await downloadFromHuggingFace('owner/repo', dir, { fetchImpl, token: 'hf_secret' });

    expect(headers.every((h) => h.Authorization === 'Bearer hf_secret')).toBe(true);
  });
});
