import type { WebviewToHost } from '../../src/ide/protocol';

(globalThis as any).__REDACTO_MODEL_SOURCE__ = 'host';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const shared = require('../../src/shared/local-ai-model-download') as typeof import('../../src/shared/local-ai-model-download');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hostModel = require('../../src/ide/host-model') as typeof import('../../src/ide/host-model');

describe('IDE host model', () => {
  let storage: Record<string, unknown>;
  let posted: WebviewToHost[];
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => new Response(`served ${String(input)}`));

  beforeEach(() => {
    (chrome.storage as any).onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    storage = { pg_settings: { nerProvider: 'transformers' } };
    posted = [];
    fetchMock.mockClear();
    (globalThis as any).fetch = fetchMock;
    (chrome.storage.local.get as jest.Mock).mockImplementation(async (key: string) => ({ [key]: storage[key] }));
    (chrome.storage.local.set as jest.Mock).mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    });
  });

  afterAll(() => {
    delete (globalThis as any).__REDACTO_MODEL_SOURCE__;
  });

  const modelUrl = (path: string) => shared.extensionModelUrl(path);

  test('asks the host for the model when Local AI is on, and runs pattern-only until it is ready', async () => {
    await hostModel.connectHostModel((message) => posted.push(message), {
      phase: 'downloading',
      receivedBytes: 10,
      totalBytes: 100,
    });

    expect(posted).toEqual([{ type: 'model.download' }]);
    await expect(hostModel.hostModelPending({ ner_provider: 'transformers' })).resolves.toBe(true);
    await expect(hostModel.hostModelPending({ ner_provider: 'off' })).resolves.toBe(false);
    const status = await hostModel.hostModelNerStatus({ ner_provider: 'transformers' });
    expect(status.payload).toEqual(expect.objectContaining({ state: 'loading', message: expect.stringContaining('10%') }));
    expect((await shared.modelAwareFetch(modelUrl('config.json'))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('loads the model from where the host serves it once it is ready', async () => {
    await hostModel.applyHostModelState({
      phase: 'idle',
      readyVersion: 'v1',
      baseUrl: 'https://pg.local/downloaded-model/v1/',
      receivedBytes: 0,
      totalBytes: 0,
    });

    await expect(hostModel.hostModelPending({ ner_provider: 'transformers' })).resolves.toBe(false);
    const response = await shared.modelAwareFetch(modelUrl('onnx/model.onnx'), { method: 'HEAD' });
    await expect(response.text()).resolves.toBe('served https://pg.local/downloaded-model/v1/onnx/model.onnx');
    expect(fetchMock).toHaveBeenCalledWith('https://pg.local/downloaded-model/v1/onnx/model.onnx', { method: 'HEAD' });

    await shared.modelAwareFetch('chrome-extension://test/wasm/x.wasm');
    expect(fetchMock).toHaveBeenLastCalledWith('chrome-extension://test/wasm/x.wasm', undefined);
  });

  test('retries a failed download at most every few minutes', async () => {
    await hostModel.connectHostModel((message) => posted.push(message));
    posted.length = 0;
    await hostModel.applyHostModelState({ phase: 'failed', error: 'offline', receivedBytes: 0, totalBytes: 0 });

    await hostModel.hostModelPending({ ner_provider: 'transformers' });
    expect(posted).toEqual([]);

    (storage[shared.MODEL_DOWNLOAD_STATE_KEY] as { updatedAt: number }).updatedAt = Date.now() - 6 * 60_000;
    await hostModel.hostModelPending({ ner_provider: 'transformers' });
    expect(posted).toEqual([{ type: 'model.download' }]);
  });
});
