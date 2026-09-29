/**
 * Privacy Guardrail — IDE theme
 *
 * Makes the panel look like part of the IDE rather than the browser extension:
 * `<html data-ide-host>` picks the host's stylesheet (`src/ide/theme/`) and
 * `data-ide-theme` its light / dark / high-contrast variant. Visual Studio and
 * JetBrains send their colors and fonts (`IdeTheme`), set here as `--ide-*`
 * variables; VS Code's webview already carries its theme as `--vscode-*`
 * variables and `vscode-dark`-style body classes, which are watched instead.
 */

import type { IdeHostKind, IdeTheme } from './protocol';

const NAME = /^[a-z0-9-]+$/;
const SANS_FALLBACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO_FALLBACK = 'ui-monospace, Consolas, monospace';

export function applyIdeHost(root: HTMLElement, host: IdeHostKind): void {
  root.dataset.ideHost = host;
  root.dataset.ideTheme ??= 'light';
}

function fontStack(family: string, fallback: string): string {
  const name = family.replace(/["\\;{}]/g, '').trim();
  return name ? `"${name}", ${fallback}` : fallback;
}

export function applyIdeTheme(root: HTMLElement, theme: IdeTheme): void {
  root.dataset.ideTheme = theme.kind;
  for (const [name, value] of Object.entries(theme.colors ?? {})) {
    if (NAME.test(name) && typeof value === 'string') root.style.setProperty(`--ide-${name}`, value);
  }
  if (theme.font?.family) root.style.setProperty('--ide-font', fontStack(theme.font.family, SANS_FALLBACK));
  if (theme.font?.size) root.style.setProperty('--ide-font-size', `${theme.font.size}px`);
  if (theme.editorFont?.family) {
    root.style.setProperty('--ide-mono-font', fontStack(theme.editorFont.family, MONO_FALLBACK));
  }
}

/** VS Code: follow the `vscode-light` / `vscode-dark` / `vscode-high-contrast` body class. */
export function watchVsCodeTheme(root: HTMLElement, body: HTMLElement): () => void {
  const update = (): void => {
    const classes = body.classList;
    root.dataset.ideTheme = classes.contains('vscode-high-contrast')
      ? classes.contains('vscode-high-contrast-light')
        ? 'light'
        : 'high-contrast'
      : classes.contains('vscode-dark')
        ? 'dark'
        : 'light';
  };
  update();
  const observer = new MutationObserver(update);
  observer.observe(body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
