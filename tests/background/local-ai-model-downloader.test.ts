import { createHash } from 'crypto';

(globalThis as any).__REDACTO_MODEL_SOURCE__ = 'huggingface';
(globalThis as any).__REDACTO_MODEL_HF_REPO__ = 'owner/model';
(globalThis as any).__REDACTO_MODEL_REVISION__ = 'abc123';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const shared = require('../../src/shared/local-ai-model-download') as typeof import('../../src/shared/local-ai-model-download');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const downloader = require('../../src/background/local-ai-model-downloader') as typeof import('../../src/background/local-ai-model-downloader');

class FakeCaches {
  stores = new Map<string, Map<string, Response>>();
  async has(name: string) { return this.stores.has(name); }
  async delete(name: string) { return this.stores.delete(name); }
  async keys() { return [...this.stores.keys()]; }
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    const store = this.stores.get(name)!;
    return {
      put: async (url: string, response: Response) => { store.set(url, response); },
      match: async (url: string) => store.get(url)?.clone(),
    } as unknown as Cache;
  }
}

function sha(data: string) {
  return createHash('sha256').update(data).digest('hex');
}

function manifestFor(files: Record<string, string>, version: string) {
  return {
    format: 1,
    version,
    files: Object.entries(files).map(([path, data]) => ({ path, size: Buffer.byteLength(data), sha256: sha(data) })),
  };
}

function fakeFetch(files: Record<string, string>, manifest: unknown) {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const prefix = 'https://huggingface.co/owner/model/resolve/abc123/';
    expect(url.startsWith(prefix)).toBe(true);
    const path = url.slice(prefix.length);
    if (path === 'redacto-model.json') return new Response(JSON.stringify(manifest));
    if (path in files) return new Response(files[path]);
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

describe('Local AI model downloader', () => {
  let storage: Record<string, unknown>;
  let caches: FakeCaches;
  let extensionVersion: string;

  beforeEach(() => {
    storage = {};
    caches = new FakeCaches();
    extensionVersion = '1.0.0';
    (chrome.storage.local.get as jest.Mock).mockImplementation(async (key: string) => ({ [key]: storage[key] }));
    (chrome.storage.local.set as jest.Mock).mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    });
    (globalThis as any).caches = caches;
  });

  const deps = (fetchImpl: typeof fetch) => ({
    fetch: fetchImpl,
    caches: caches as unknown as CacheStorage,
    extensionVersion: () => extensionVersion,
  });

  test('downloads, verifies and serves the model from its extension URLs', async () => {
    const files = { 'config.json': '{"a":1}', 'onnx/model.onnx.data': 'weights' };
    const state = await downloader.ensureLocalAiModel('test', deps(fakeFetch(files, manifestFor(files, 'v1'))));

    expect(state).toEqual(expect.objectContaining({ readyVersion: 'v1', phase: 'idle', checkedExtensionVersion: '1.0.0' }));
    await expect(downloader.isLocalAiModelReady(deps(fakeFetch({}, {})))).resolves.toBe(true);

    const url = shared.extensionModelUrl('onnx/model.onnx.data');
    expect(url).toBe('chrome-extension://test/models/ner/bardsai-eu-pii-anonimization-multilang/onnx/model.onnx.data');
    await expect((await shared.modelAwareFetch(url)).text()).resolves.toBe('weights');
    expect((await shared.modelAwareFetch(url, { method: 'HEAD' })).ok).toBe(true);
    expect((await shared.modelAwareFetch(shared.extensionModelUrl('missing.json'))).status).toBe(404);
  });

  test('rejects a file whose hash does not match and keeps nothing', async () => {
    const files = { 'config.json': '{"a":1}' };
    const manifest = manifestFor({ 'config.json': '{"a":2}' }, 'v1');
    const state = await downloader.ensureLocalAiModel('test', deps(fakeFetch(files, manifest)));

    expect(state.phase).toBe('failed');
    expect(state.error).toMatch(/SHA-256 mismatch/);
    expect(state.readyVersion).toBeUndefined();
    await expect(downloader.isLocalAiModelReady(deps(fakeFetch({}, {})))).resolves.toBe(false);
  });

  test('checks once per extension version and swaps in a newer model', async () => {
    const v1 = { 'config.json': 'one' };
    await downloader.ensureLocalAiModel('install', deps(fakeFetch(v1, manifestFor(v1, 'v1'))));

    const sameVersionFetch = fakeFetch(v1, manifestFor(v1, 'v1'));
    await downloader.ensureLocalAiModel('startup', deps(sameVersionFetch));
    expect(sameVersionFetch).not.toHaveBeenCalled();

    extensionVersion = '1.1.0';
    const v2 = { 'config.json': 'two' };
    const state = await downloader.ensureLocalAiModel('update', deps(fakeFetch(v2, manifestFor(v2, 'v2'))));

    expect(state.readyVersion).toBe('v2');
    expect(await caches.keys()).toEqual([shared.modelCacheName('v2')]);
    await expect((await shared.modelAwareFetch(shared.extensionModelUrl('config.json'))).text()).resolves.toBe('two');
  });

  test('a failed update check keeps the current model', async () => {
    const v1 = { 'config.json': 'one' };
    await downloader.ensureLocalAiModel('install', deps(fakeFetch(v1, manifestFor(v1, 'v1'))));

    extensionVersion = '1.1.0';
    const offline = jest.fn(async () => { throw new TypeError('NetworkError'); }) as unknown as typeof fetch;
    const state = await downloader.ensureLocalAiModel('update', deps(offline));

    expect(state).toEqual(expect.objectContaining({ phase: 'failed', readyVersion: 'v1' }));
    expect(shared.modelDownloadMessage(state)).toMatch(/current model stays in use/);
    await expect(downloader.isLocalAiModelReady(deps(offline))).resolves.toBe(true);
  });

  test('rejects manifests with unsafe paths', () => {
    expect(() => downloader.parseModelManifest({ format: 1, version: 'v1', files: [{ path: '../x', size: 1, sha256: 'a'.repeat(64) }] }))
      .toThrow(/not a valid model manifest/);
  });
});
