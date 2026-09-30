import { createHostBridge } from '../../src/ide/host-bridge';

describe('IDE host bridge', () => {
  it('talks to VS Code through acquireVsCodeApi and window messages', () => {
    const postMessage = jest.fn();
    const handlers: Array<(event: { data: unknown }) => void> = [];
    const win = {
      acquireVsCodeApi: () => ({ postMessage }),
      addEventListener: (_type: string, handler: (event: { data: unknown }) => void) => handlers.push(handler),
    };
    const bridge = createHostBridge(win as never);
    const received = jest.fn();
    bridge.onMessage(received);

    bridge.post({ type: 'ready' });
    handlers[0]({ data: { type: 'anonymize', text: 'x', source: 'editor' } });
    handlers[0]({ data: 'not a message' });

    expect(bridge.host).toBe('vscode');
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({ type: 'anonymize', text: 'x', source: 'editor' });
  });

  it('talks to Visual Studio through chrome.webview', () => {
    let handler: ((event: { data: unknown }) => void) | undefined;
    const webview = { postMessage: jest.fn(), addEventListener: (_: string, h: typeof handler) => (handler = h) };
    const bridge = createHostBridge({ chrome: { webview } } as never);
    const received = jest.fn();
    bridge.onMessage(received);

    bridge.post({ type: 'copy', text: 'y' });
    handler?.({ data: { type: 'init', hostName: 'Visual Studio', storage: {} } });

    expect(bridge.host).toBe('visualstudio');
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'copy', text: 'y' });
    expect(received).toHaveBeenCalledWith({ type: 'init', hostName: 'Visual Studio', storage: {} });
  });

  it('queues for JCEF until the host attaches, and accepts JSON strings', () => {
    const win: Record<string, any> = {};
    const bridge = createHostBridge(win as never);
    const received = jest.fn();
    bridge.onMessage(received);

    bridge.post({ type: 'ready' });
    const sent: string[] = [];
    win.__pgJcefPost = (json: string) => sent.push(json);
    win.__pgJcefAttached();
    bridge.post({ type: 'copy', text: 'z' });
    win.__pgHostMessage('{"type":"anonymize","text":"t","source":"console"}');

    expect(bridge.host).toBe('jetbrains');
    expect(sent.map((json) => JSON.parse(json))).toEqual([{ type: 'ready' }, { type: 'copy', text: 'z' }]);
    expect(received).toHaveBeenCalledWith({ type: 'anonymize', text: 't', source: 'console' });
  });
});
