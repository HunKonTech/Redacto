import { createChromeShim, installChromeShim } from '../../src/ide/chrome-shim';
import type { WebviewToHost } from '../../src/ide/protocol';

function setup(storage = {}) {
  const posted: WebviewToHost[] = [];
  const handleMessage = jest.fn().mockResolvedValue({ type: 'PII_RESULT' });
  const shim = createChromeShim({
    assetBase: 'https://pg.local/index.html',
    storage,
    post: (message) => posted.push(message),
    handleMessage,
  });
  return { shim, posted, handleMessage };
}

describe('IDE chrome shim', () => {
  it('reads the host snapshot and supports the get() key forms', async () => {
    const { shim } = setup({ local: { a: 1, b: { c: 2 } } });
    await expect(shim.storage.local.get()).resolves.toEqual({ a: 1, b: { c: 2 } });
    await expect(shim.storage.local.get('a')).resolves.toEqual({ a: 1 });
    await expect(shim.storage.local.get(['a', 'missing'])).resolves.toEqual({ a: 1 });
    await expect(shim.storage.local.get({ missing: 'fallback', a: 0 })).resolves.toEqual({ missing: 'fallback', a: 1 });
    await expect(shim.storage.session.get()).resolves.toEqual({});
  });

  it('writes through to the host and reports changes', async () => {
    const { shim, posted } = setup({ local: { a: 1 } });
    const listener = jest.fn();
    shim.storage.onChanged.addListener(listener);

    await shim.storage.local.set({ a: 2 });
    expect(posted).toEqual([{ type: 'storage.set', area: 'local', items: { a: 2 } }]);
    expect(listener).toHaveBeenCalledWith({ a: { oldValue: 1, newValue: 2 } }, 'local');

    await shim.storage.session.remove(['nothing']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(posted).toHaveLength(1);

    await shim.storage.local.remove('a');
    expect(posted[1]).toEqual({ type: 'storage.remove', area: 'local', keys: ['a'] });
    expect(listener).toHaveBeenLastCalledWith({ a: { oldValue: 2 } }, 'local');
    await expect(shim.storage.local.get('a')).resolves.toEqual({});
  });

  it('keeps volatile keys in the page only', async () => {
    const posted: WebviewToHost[] = [];
    const shim = createChromeShim({
      assetBase: 'https://pg.local/index.html',
      storage: {},
      post: (message) => posted.push(message),
      handleMessage: jest.fn(),
      volatileKeys: ['progress'],
    });
    const listener = jest.fn();
    shim.storage.onChanged.addListener(listener);

    await shim.storage.local.set({ progress: 50 });
    await shim.storage.local.set({ progress: 60, a: 1 });
    await shim.storage.local.remove('progress');
    expect(posted).toEqual([{ type: 'storage.set', area: 'local', items: { a: 1 } }]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('hands out copies, so callers cannot change stored values in place', async () => {
    const { shim } = setup({ local: { list: [1] } });
    const { list } = (await shim.storage.local.get('list')) as { list: number[] };
    list.push(2);
    await expect(shim.storage.local.get('list')).resolves.toEqual({ list: [1] });
  });

  it('resolves asset paths against the page folder and routes messages', async () => {
    const { shim, handleMessage } = setup();
    expect(shim.runtime.getURL('wasm/x.wasm')).toBe('https://pg.local/wasm/x.wasm');
    expect(shim.runtime.getURL('/models/')).toBe('https://pg.local/models/');
    await shim.runtime.sendMessage({ type: 'DETECT_PII' });
    expect(handleMessage).toHaveBeenCalledWith({ type: 'DETECT_PII' });
  });

  it('keeps what the host already put on window.chrome', () => {
    const webview = { postMessage: jest.fn() };
    const target: { chrome?: unknown } = { chrome: { webview } };
    installChromeShim(target, setup().shim);
    const chrome = target.chrome as { webview: unknown; storage: unknown; runtime: unknown };
    expect(chrome.webview).toBe(webview);
    expect(chrome.storage).toBeDefined();
    expect(chrome.runtime).toBeDefined();
  });
});
