/**
 * Privacy Guardrail — web page entry (GitHub Pages)
 *
 * The side panel as a plain web page: the same Svelte panel and the same
 * `chrome.*` shim as the IDE webview, with this browser as the "host".
 * Detection runs in the page (WASM rules + the local AI model, loaded from
 * this site's own folder); the text never leaves the browser.
 *
 * - `chrome.storage.local` → `localStorage` (History, identity vault, settings).
 * - `chrome.storage.session` → `sessionStorage` (gone when the tab closes).
 *
 * A service worker (sw.js, offline.ts) keeps the page, and on request the
 * model, in Cache Storage so it also works offline.
 *
 * Nothing is sent to a server: the page is static and its CSP (web.html)
 * only allows requests to its own origin, for its scripts and model files.
 */

import '../shared/styles/tokens.css';
import './web.css';
import { createChromeShim, installChromeShim } from '../ide/chrome-shim';
import { persist, readArea } from './browser-storage';
import { setUpOffline } from './offline';

async function start(): Promise<void> {
  // Everything below reads `chrome.*` when it loads, so it is imported only
  // once the shim is in place (see webpack.web.config.js).
  const { routeRuntimeMessage } = await import('../ide/runtime-router');
  installChromeShim(
    globalThis as { chrome?: unknown },
    createChromeShim({
      assetBase: document.baseURI,
      storage: { local: readArea('local'), session: readArea('session') },
      post: persist,
      handleMessage: routeRuntimeMessage,
    }),
  );

  const [{ mount }, { default: App }, { initDebugFlag }] = await Promise.all([
    import('svelte'),
    import('../sidepanel/App.svelte'),
    import('../offscreen/debug'),
  ]);

  initDebugFlag();
  const target = document.getElementById('app');
  if (!target) throw new Error('Web panel mount target #app not found');
  mount(App, { target, props: { settingsTab: true } });
}

setUpOffline();
void start();
