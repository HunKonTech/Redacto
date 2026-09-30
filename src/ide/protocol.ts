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
export type SelectionSource = 'editor' | 'console' | 'terminal' | 'output';

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

/** Webview → host. */
export type WebviewToHost =
  /** The page loaded; answer with `init`, then deliver queued selections. */
  | { type: 'ready' }
  | { type: 'storage.set'; area: StorageAreaName; items: StorageSnapshot }
  | { type: 'storage.remove'; area: StorageAreaName; keys: string[] }
  | { type: 'copy'; text: string };

/** Host → webview. */
export type HostToWebview =
  | {
      type: 'init';
      /** Shown in History next to each entry, e.g. "VS Code". */
      hostName: string;
      /** What the host kept of each area; `session` lasts as long as the IDE runs. */
      storage: Partial<Record<StorageAreaName, StorageSnapshot>>;
      theme?: IdeTheme;
    }
  /** The IDE theme changed. */
  | { type: 'theme'; theme: IdeTheme }
  | { type: 'anonymize'; text: string; source: SelectionSource };

