/**
 * Redacto — IDE host protocol
 *
 * The messages the IDE webview (the side panel running inside VS Code,
 * a JetBrains IDE or Visual Studio) exchanges with the plugin hosting it.
 * Every host speaks JSON objects of these shapes; see `docs/developer/ide-plugins.md`.
 */

export type StorageAreaName = 'local' | 'session';

export type StorageSnapshot = Record<string, unknown>;

/** Where in the IDE a selection was taken from. */
export type SelectionSource =
  | 'editor'
  | 'console'
  | 'terminal'
  | 'output'
  /** Error List, Problems. */
  | 'errors'
  /** Variables, Watch. */
  | 'debug'
  | 'tests'
  /** Any other view or tool window. */
  | 'view';

/**
 * An editing key the IDE turned into one of its own commands before the
 * webview saw it (Visual Studio: Delete, Ctrl+A, Ctrl+C/X/V, Ctrl+Z/Y); the
 * host hands it back as an `edit` message (src/ide/edit-commands.ts).
 */
export type EditCommand = 'selectAll' | 'delete' | 'copy' | 'cut' | 'paste' | 'undo' | 'redo';

/** The IDE a panel runs in; picks the look (`src/ide/theme/`). */
export type IdeHostKind = 'vscode' | 'visualstudio' | 'jetbrains';

/**
 * The host's current theme. VS Code needs none: its webviews get the theme as
 * `--vscode-*` variables. Visual Studio and JetBrains send their colors, each
 * becoming `--ide-<name>` (see `src/ide/theme/ide-base.css` for the names).
 */
export interface IdeTheme {
  kind: 'light' | 'dark' | 'high-contrast';
  colors?: Record<string, string>;
  /** UI font; `size` in CSS pixels. */
  font?: { family: string; size?: number };
  /** Editor font, for code and anonymized text. */
  editorFont?: { family: string; size?: number };
}

/**
 * The Local AI model download the host runs (docs/developer/model-download.md):
 * the host downloads the files listed in the Hugging Face repository's
 * `redacto-model.json` (repository and revision: `model-source.json` next to
 * the panel) into its data folder, verifies each SHA-256, and serves the
 * complete version at `baseUrl`. Same fields as the extension's
 * `ModelDownloadState` (src/shared/local-ai-model-download.ts).
 */
export interface HostModelState {
  phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'failed';
  /** Model version that is complete on disk and served at `baseUrl`. */
  readyVersion?: string;
  /** Where the ready version's files are served, ending in `/`. */
  baseUrl?: string;
  /** Version being downloaded (an update keeps `readyVersion` usable meanwhile). */
  targetVersion?: string;
  receivedBytes: number;
  totalBytes: number;
  error?: string;
}

/** Webview → host. */
export type WebviewToHost =
  /** The page loaded; answer with `init`, then deliver queued selections. */
  | { type: 'ready' }
  | { type: 'storage.set'; area: StorageAreaName; items: StorageSnapshot }
  | { type: 'storage.remove'; area: StorageAreaName; keys: string[] }
  | { type: 'copy'; text: string }
  /**
   * Local AI is on: make sure the model is there. The host downloads it when
   * missing, checks for a newer one once per plugin version, and retries
   * after a failure; it answers with `model` messages.
   */
  | { type: 'model.download' };

/** Host → webview. */
export type HostToWebview =
  | {
      type: 'init';
      /** Shown in History next to each entry, e.g. "VS Code". */
      hostName: string;
      /** What the host kept of each area; `session` lasts as long as the IDE runs. */
      storage: Partial<Record<StorageAreaName, StorageSnapshot>>;
      theme?: IdeTheme;
      /** The model on disk, if any (no download starts before `model.download`). */
      model?: HostModelState;
    }
  /** Local AI model download progress, and the result. */
  | { type: 'model'; state: HostModelState }
  /** The IDE theme changed. */
  | { type: 'theme'; theme: IdeTheme }
  | { type: 'anonymize'; text: string; source: SelectionSource }
  /** Run an editing key on the panel's focused field; `text` is the clipboard, for `paste`. */
  | { type: 'edit'; command: EditCommand; text?: string };

