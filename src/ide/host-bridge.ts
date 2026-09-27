/**
 * Privacy Guardrail — IDE host bridge
 *
 * One transport over the three webviews the plugins use:
 *
 * - VS Code: `acquireVsCodeApi().postMessage`, answers as window `message` events.
 * - Visual Studio (WebView2): `window.chrome.webview.postMessage`, answers as
 *   `message` events on `window.chrome.webview`.
 * - JetBrains (JCEF): the host injects `window.__pgJcefPost(json)` once the page
 *   has loaded and calls `window.__pgJcefAttached()`; it answers by calling
 *   `window.__pgHostMessage(message)`. Messages posted before that are queued.
 */

import type { HostToWebview, WebviewToHost } from './protocol';

export interface HostBridge {
  post(message: WebviewToHost): void;
  onMessage(listener: (message: HostToWebview) => void): void;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface WebView2 {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

type HostWindow = typeof globalThis & {
  acquireVsCodeApi?: () => VsCodeApi;
  chrome?: { webview?: WebView2 };
  __pgJcefPost?: (json: string) => void;
  __pgJcefAttached?: () => void;
  __pgHostMessage?: (message: HostToWebview | string) => void;
};

function parse(data: unknown): HostToWebview | null {
  const value = typeof data === 'string' ? safeJson(data) : data;
  return value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
    ? (value as HostToWebview)
    : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createHostBridge(win: HostWindow = globalThis as HostWindow): HostBridge {
  const listeners: Array<(message: HostToWebview) => void> = [];
  const deliver = (data: unknown): void => {
    const message = parse(data);
    if (message) for (const listener of listeners) listener(message);
  };

  // Read before the shim adds `chrome.runtime`/`chrome.storage` to the same object.
  const webview2 = win.chrome?.webview;
  const vscode = typeof win.acquireVsCodeApi === 'function' ? win.acquireVsCodeApi() : null;

  let send: (message: WebviewToHost) => void;
  if (vscode) {
    send = (message) => vscode.postMessage(message);
    win.addEventListener?.('message', (event: MessageEvent) => deliver(event.data));
  } else if (webview2) {
    send = (message) => webview2.postMessage(message);
    webview2.addEventListener('message', (event) => deliver(event.data));
  } else {
    const queue: WebviewToHost[] = [];
    send = (message) => {
      if (win.__pgJcefPost) win.__pgJcefPost(JSON.stringify(message));
      else queue.push(message);
    };
    win.__pgJcefAttached = () => {
      for (const message of queue.splice(0)) send(message);
    };
    win.__pgHostMessage = deliver;
  }

  return {
    post: send,
    onMessage: (listener) => void listeners.push(listener),
  };
}
