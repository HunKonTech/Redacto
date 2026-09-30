/**
 * Redacto — VS Code host
 *
 * Hosts the shared side panel (`webview/`, built by `npm run build:ide-webview`
 * in the repository root) in an Activity Bar view and hands it the selection
 * the user picks "Anonymize" on. The panel does the detection and shows the
 * original next to the anonymized text; this file only moves messages and
 * keeps the panel's storage. The selected text is never modified.
 *
 * Protocol: src/ide/protocol.ts in the repository root.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { panelHtml } from './webview-html';

type StorageAreaName = 'local' | 'session';
type Snapshot = Record<string, unknown>;
type SelectionSource = 'editor' | 'console' | 'terminal' | 'output';

type FromWebview =
  | { type: 'ready' }
  | { type: 'storage.set'; area: StorageAreaName; items: Snapshot }
  | { type: 'storage.remove'; area: StorageAreaName; keys: string[] }
  | { type: 'copy'; text: string };

const VIEW_ID = 'privacyGuardrail.panel';
const LOCAL_STATE_KEY = 'privacyGuardrail.storage.local';

class PanelStore {
  /** Lasts as long as this VS Code window, like `chrome.storage.session`. */
  private session: Snapshot = {};

  constructor(private readonly state: vscode.Memento) {}

  snapshot(): Record<StorageAreaName, Snapshot> {
    return { local: this.state.get<Snapshot>(LOCAL_STATE_KEY, {}), session: this.session };
  }

  async set(area: StorageAreaName, items: Snapshot): Promise<void> {
    if (area === 'session') {
      this.session = { ...this.session, ...items };
      return;
    }
    await this.state.update(LOCAL_STATE_KEY, { ...this.state.get<Snapshot>(LOCAL_STATE_KEY, {}), ...items });
  }

  async remove(area: StorageAreaName, keys: string[]): Promise<void> {
    const drop = (from: Snapshot): Snapshot =>
      Object.fromEntries(Object.entries(from).filter(([key]) => !keys.includes(key)));
    if (area === 'session') {
      this.session = drop(this.session);
      return;
    }
    await this.state.update(LOCAL_STATE_KEY, drop(this.state.get<Snapshot>(LOCAL_STATE_KEY, {})));
  }
}

class PanelProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private ready = false;
  /** Selections made before the panel finished loading. */
  private pending: Array<{ text: string; source: SelectionSource }> = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: PanelStore,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    const root = vscode.Uri.joinPath(this.extensionUri, 'webview');
    this.view = view;
    this.ready = false;
    view.webview.options = { enableScripts: true, localResourceRoots: [root] };
    view.webview.html = this.html(view.webview, root);
    view.webview.onDidReceiveMessage((message: FromWebview) => void this.onMessage(message));
    view.onDidDispose(() => {
      this.view = null;
      this.ready = false;
    });
  }

  async anonymize(text: string, source: SelectionSource): Promise<void> {
    if (!text.trim()) {
      void vscode.window.showInformationMessage('Redacto: nothing selected to anonymize.');
      return;
    }
    this.pending.push({ text, source });
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    this.flush();
  }

  private flush(): void {
    if (!this.view || !this.ready) return;
    for (const { text, source } of this.pending.splice(0)) {
      void this.view.webview.postMessage({ type: 'anonymize', text, source });
    }
  }

  private async onMessage(message: FromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.view?.webview.postMessage({ type: 'init', hostName: 'VS Code', storage: this.store.snapshot() });
        this.ready = true;
        this.flush();
        break;
      case 'storage.set':
        await this.store.set(message.area, message.items);
        break;
      case 'storage.remove':
        await this.store.remove(message.area, message.keys);
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(message.text);
        break;
    }
  }

  private html(webview: vscode.Webview, root: vscode.Uri): string {
    const page = fs.readFileSync(vscode.Uri.joinPath(root, 'index.html').fsPath, 'utf8');
    return panelHtml(page, webview.cspSource, webview.asWebviewUri(root).toString());
  }
}

function editorSource(editor: vscode.TextEditor): SelectionSource {
  // The Output panel is an editor too; its documents use the `output` scheme.
  return editor.document.uri.scheme === 'output' ? 'output' : 'editor';
}

function editorSelection(editor: vscode.TextEditor): string {
  return editor.selections
    .filter((selection) => !selection.isEmpty)
    .map((selection) => editor.document.getText(selection))
    .join('\n');
}

/**
 * The integrated terminal's selection. There is no stable API for it, so it is
 * copied through the clipboard, and the clipboard is put back afterwards.
 */
async function terminalSelection(): Promise<string> {
  const terminal = vscode.window.activeTerminal as (vscode.Terminal & { selection?: string }) | undefined;
  if (typeof terminal?.selection === 'string') return terminal.selection;
  const saved = await vscode.env.clipboard.readText();
  try {
    await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
    return await vscode.env.clipboard.readText();
  } finally {
    await vscode.env.clipboard.writeText(saved);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PanelProvider(context.extensionUri, new PanelStore(context.globalState));
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      // Detection loads a model; keep the page (and it) alive while hidden.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('privacyGuardrail.openPanel', () =>
      vscode.commands.executeCommand(`${VIEW_ID}.focus`),
    ),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await provider.anonymize(editorSelection(editor), editorSource(editor));
    }),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeTerminalSelection', async () => {
      await provider.anonymize(await terminalSelection(), 'terminal');
    }),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeClipboard', async () => {
      await provider.anonymize(await vscode.env.clipboard.readText(), 'console');
    }),
  );
}

export function deactivate(): void {}
