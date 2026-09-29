/**
 * Privacy Guardrail — IDE webview entry
 *
 * The browser side panel, running inside an IDE plugin's webview. Waits for
 * the host's `init` (stored History, vault and settings), installs the
 * `chrome.*` shim over it, then mounts the same Svelte panel. Detection runs
 * in this page — the WASM pipeline plus the local AI model — with no service
 * worker or offscreen document in between.
 */

import '../shared/styles/tokens.css';
// After the panel's tokens: each IDE's look (see ide-theme.ts).
import './theme/ide-base.css';
import './theme/vscode.css';
import './theme/visualstudio.css';
import './theme/jetbrains.css';
import { createChromeShim, installChromeShim } from './chrome-shim';
import { createHostBridge } from './host-bridge';
import { withIdeDefaults } from './ide-defaults';
import { applyIdeHost, applyIdeTheme, watchVsCodeTheme } from './ide-theme';
import type { HostToWebview } from './protocol';

type InitMessage = Extract<HostToWebview, { type: 'init' }>;

const bridge = createHostBridge();
const root = document.documentElement;
applyIdeHost(root, bridge.host);
if (bridge.host === 'vscode') watchVsCodeTheme(root, document.body);

const init = new Promise<InitMessage>((resolve) => {
  bridge.onMessage((message) => {
    if (message.type === 'init') resolve(message);
    if (message.type === 'theme') applyIdeTheme(root, message.theme);
  });
});
bridge.post({ type: 'ready' });

void start();

async function start(): Promise<void> {
  const { hostName, storage, theme } = await init;
  if (theme) applyIdeTheme(root, theme);

  // Everything below reads `chrome.*` when it loads, so it is imported only
  // once the shim is in place. (webpack inlines these; see webpack.ide.config.js.)
  const { routeRuntimeMessage } = await import('./runtime-router');
  installChromeShim(
    globalThis as { chrome?: unknown },
    createChromeShim({
      assetBase: document.baseURI,
      storage: { ...storage, local: withIdeDefaults(storage.local) },
      post: (message) => bridge.post(message),
      handleMessage: routeRuntimeMessage,
    }),
  );

  const [{ mount }, { default: App }, { requestAnonymize }, { setClipboardWriter }, { initDebugFlag }] =
    await Promise.all([
      import('svelte'),
      import('../sidepanel/App.svelte'),
      import('../sidepanel/external-input'),
      import('../sidepanel/clipboard'),
      import('../shared/debug-log'),
    ]);

  initDebugFlag();
  setClipboardWriter(async (text) => bridge.post({ type: 'copy', text }));
  bridge.onMessage((message) => {
    if (message.type !== 'anonymize' || !message.text) return;
    requestAnonymize(message.text, { label: `${hostName} · ${message.source}` });
  });

  const target = document.getElementById('app');
  if (!target) throw new Error('IDE panel mount target #app not found');
  mount(App, { target, props: { settingsTab: 'ide' } });
}
