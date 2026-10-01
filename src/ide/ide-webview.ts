/**
 * Redacto — IDE webview entry
 *
 * The browser side panel, running inside an IDE plugin's webview. Waits for
 * the host's `init` (stored History, vault and settings), installs the
 * `chrome.*` shim over it, then mounts the same Svelte panel. Detection runs
 * in this page — the WASM pipeline plus the local AI model — with no service
 * worker or offscreen document in between. The host downloads the model on
 * first use and reports its progress (host-model.ts).
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
import { MODEL_DOWNLOAD_STATE_KEY } from '../shared/local-ai-model-download';
import type { HostModelState, HostToWebview } from './protocol';

type InitMessage = Extract<HostToWebview, { type: 'init' }>;

const bridge = createHostBridge();
const root = document.documentElement;
applyIdeHost(root, bridge.host);
if (bridge.host === 'vscode') watchVsCodeTheme(root, document.body);

// Download progress can arrive before the shim is up; the latest one wins.
let onModelState: (state: HostModelState) => void = () => {};
const init = new Promise<InitMessage>((resolve) => {
  bridge.onMessage((message) => {
    if (message.type === 'init') resolve(message);
    if (message.type === 'theme') applyIdeTheme(root, message.theme);
    if (message.type === 'model') onModelState(message.state);
  });
});
bridge.post({ type: 'ready' });

void start();

async function start(): Promise<void> {
  let latestModelState: HostModelState | undefined;
  onModelState = (state) => {
    latestModelState = state;
  };
  const { hostName, storage, theme, model } = await init;
  if (theme) applyIdeTheme(root, theme);

  // Everything below reads `chrome.*` when it loads, so it is imported only
  // once the shim is in place. (webpack inlines these; see webpack.ide.config.js.)
  const [{ routeRuntimeMessage }, { applyHostModelState, connectHostModel }] = await Promise.all([
    import('./runtime-router'),
    import('./host-model'),
  ]);
  installChromeShim(
    globalThis as { chrome?: unknown },
    createChromeShim({
      assetBase: document.baseURI,
      storage: { ...storage, local: withIdeDefaults(storage.local) },
      post: (message) => bridge.post(message),
      handleMessage: routeRuntimeMessage,
      volatileKeys: [MODEL_DOWNLOAD_STATE_KEY],
    }),
  );
  onModelState = (state) => void applyHostModelState(state);
  await connectHostModel((message) => bridge.post(message), latestModelState ?? model);

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
