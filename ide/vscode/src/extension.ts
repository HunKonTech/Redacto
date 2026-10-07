/**
 * Redacto — VS Code host
 *
 * Hosts the shared side panel (`webview/`, built by `npm run build:ide-webview`
 * in the repository root) in an Activity Bar view and hands it the selection
 * the user picks "Anonymize" on. The panel does the detection and shows the
 * original next to the anonymized text; this file only moves messages, keeps
 * the panel's storage and downloads the Local AI model on first use
 * (model-download.ts). The selected text is never modified.
 *
 * Protocol: src/ide/protocol.ts in the repository root.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { ModelDownloader, type ModelState } from './model-download';
import { panelHtml } from './webview-html';

type StorageAreaName = 'local' | 'session';
type Snapshot = Record<string, unknown>;
type SelectionSource = 'editor' | 'console' | 'terminal' | 'output' | 'errors' | 'debug' | 'tests' | 'view';

type FromWebview =
  | { type: 'ready' }
  | { type: 'storage.set'; area: StorageAreaName; items: Snapshot }
  | { type: 'storage.remove'; area: StorageAreaName; keys: string[] }
  | { type: 'copy'; text: string }
  | { type: 'model.download' };

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
    private readonly model: ModelDownloader,
  ) {
    model.onState(() => {
      if (this.view && this.ready) void this.view.webview.postMessage({ type: 'model', state: this.modelState() });
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    const root = vscode.Uri.joinPath(this.extensionUri, 'webview');
    this.view = view;
    this.ready = false;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [root, vscode.Uri.file(this.model.modelDir)],
    };
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
        await this.view?.webview.postMessage({
          type: 'init',
          hostName: 'VS Code',
          storage: this.store.snapshot(),
          model: this.modelState(),
        });
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
      case 'model.download':
        void this.model.ensure();
        break;
    }
  }

  /** The download state, plus where the webview loads the ready model from. */
  private modelState(): ModelState & { baseUrl?: string } {
    const dir = this.model.readyDir();
    const baseUrl = dir && this.view ? `${this.view.webview.asWebviewUri(vscode.Uri.file(dir)).toString()}/` : undefined;
    return { ...this.model.current(), baseUrl };
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
 * What VS Code's own copy command `command` copies, for the places that have
 * no API for their selection (terminal, Debug Console, Problems, other views).
 * The clipboard is emptied first, so nothing selected reads as nothing rather
 * than the old clipboard, and put back afterwards.
 */
async function copiedBy(command: string, ...args: unknown[]): Promise<string> {
  const saved = await vscode.env.clipboard.readText();
  try {
    await vscode.env.clipboard.writeText('');
    await vscode.commands.executeCommand(command, ...args);
    return await vscode.env.clipboard.readText();
  } finally {
    await vscode.env.clipboard.writeText(saved);
  }
}

/** The selection of the editor the command was run on (code, or an Output channel). */
async function selectionOf(uri: unknown): Promise<{ text: string; source: SelectionSource }> {
  const editor = vscode.window.activeTextEditor;
  if (editor && (!(uri instanceof vscode.Uri) || uri.toString() === editor.document.uri.toString())) {
    return { text: editorSelection(editor), source: editorSource(editor) };
  }
  // An editor extensions do not see (e.g. a large Output channel): copy what is selected there.
  return { text: await copiedBy('editor.action.clipboardCopyAction'), source: 'output' };
}

/** The integrated terminal's selection. */
async function terminalSelection(): Promise<string> {
  const terminal = vscode.window.activeTerminal as (vscode.Terminal & { selection?: string }) | undefined;
  if (typeof terminal?.selection === 'string') return terminal.selection;
  return copiedBy('workbench.action.terminal.copySelection');
}

/** What the Variables and Watch views' context menus pass a command. */
interface VariableContext {
  variable?: { name?: string; value?: string };
}

/**
 * The value of a variable or watch expression: the one right-clicked, or, from
 * the key, the selected one, as "Copy Value" gives it.
 */
async function variableValue(context: VariableContext | undefined): Promise<string> {
  return context?.variable?.value ?? copiedBy('workbench.debug.viewlet.action.copyValue');
}

/** What the Test Results context menu passes a command. */
interface TestMessageContext {
  message?: vscode.TestMessage;
}

function testMessageText(context: TestMessageContext | undefined): string {
  const message = context?.message;
  if (!message) return '';
  const text = typeof message.message === 'string' ? message.message : message.message.value;
  return [
    text,
    message.expectedOutput !== undefined ? `Expected:\n${message.expectedOutput}` : '',
    message.actualOutput !== undefined ? `Actual:\n${message.actualOutput}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Download feedback outside the panel: a progress notification while the
 * model downloads, and a warning with "Try again" when the first download
 * fails (the panel shows the same in its header).
 */
function showModelProgress(model: ModelDownloader): void {
  let session: { report: (state: ModelState) => void; done: () => void } | null = null;
  model.onState((state) => {
    const active = state.phase === 'downloading' || state.phase === 'verifying';
    if (active && !session) {
      void vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: state.readyVersion ? 'Redacto: updating the Local AI model' : 'Redacto: downloading the Local AI model',
        },
        (progress) =>
          new Promise<void>((resolve) => {
            let reported = 0;
            session = {
              report: (next) => {
                const percent = next.totalBytes > 0 ? Math.floor((next.receivedBytes / next.totalBytes) * 100) : 0;
                const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;
                progress.report({
                  increment: Math.max(0, percent - reported),
                  message: `${percent}% (${megabytes(next.receivedBytes)} of ${megabytes(next.totalBytes)})`,
                });
                reported = Math.max(reported, percent);
              },
              done: resolve,
            };
            session.report(state);
          }),
      );
    } else if (active) {
      session?.report(state);
    } else if (session) {
      session.done();
      session = null;
    }
    if (state.phase === 'failed' && !state.readyVersion) {
      void vscode.window
        .showWarningMessage(
          `Redacto: the Local AI model could not be downloaded (${state.error ?? 'unknown error'}). Pattern-based detection keeps working meanwhile.`,
          'Try again',
        )
        .then((choice) => {
          if (choice) void model.ensure();
        });
    }
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const model = new ModelDownloader(
    vscode.Uri.joinPath(context.extensionUri, 'webview').fsPath,
    vscode.Uri.joinPath(context.globalStorageUri, 'local-ai-model').fsPath,
    String(context.extension.packageJSON.version),
  );
  showModelProgress(model);
  const provider = new PanelProvider(context.extensionUri, new PanelStore(context.globalState), model);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      // Detection loads a model; keep the page (and it) alive while hidden.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('privacyGuardrail.openPanel', () =>
      vscode.commands.executeCommand(`${VIEW_ID}.focus`),
    ),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeSelection', async (uri?: unknown) => {
      const { text, source } = await selectionOf(uri);
      await provider.anonymize(text, source);
    }),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeTerminalSelection', async () => {
      await provider.anonymize(await terminalSelection(), 'terminal');
    }),
    // The Debug Console and Problems views take no context menu items from
    // extensions; these run from the "Anonymize selection" key there.
    vscode.commands.registerCommand('privacyGuardrail.anonymizeDebugConsoleSelection', async () => {
      await provider.anonymize(await copiedBy('debug.replCopy'), 'console');
    }),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeProblems', async () => {
      await provider.anonymize(await copiedBy('problems.action.copy'), 'errors');
    }),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeVariable', async (context?: VariableContext) => {
      await provider.anonymize(await variableValue(context), 'debug');
    }),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeTestMessage', async (context?: TestMessageContext) => {
      await provider.anonymize(testMessageText(context), 'tests');
    }),
    // Anywhere else text can be selected (hovers, other views, ...).
    vscode.commands.registerCommand('privacyGuardrail.anonymizeFocusedSelection', async () => {
      await provider.anonymize(await copiedBy('editor.action.clipboardCopyAction'), 'view');
    }),
    vscode.commands.registerCommand('privacyGuardrail.anonymizeClipboard', async () => {
      await provider.anonymize(await vscode.env.clipboard.readText(), 'console');
    }),
  );
}

export function deactivate(): void {}
