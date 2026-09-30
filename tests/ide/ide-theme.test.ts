/**
 * @jest-environment jsdom
 */
import { applyIdeHost, applyIdeTheme, watchVsCodeTheme } from '../../src/ide/ide-theme';

describe('IDE theme', () => {
  it('marks the host and defaults to the light variant', () => {
    const root = document.createElement('html');
    applyIdeHost(root, 'jetbrains');
    expect(root.dataset.ideHost).toBe('jetbrains');
    expect(root.dataset.ideTheme).toBe('light');
  });

  it('sets the host colors and fonts as --ide-* variables, skipping bad names', () => {
    const root = document.createElement('html');
    applyIdeTheme(root, {
      kind: 'dark',
      colors: { bg: '#2b2d30', 'button-fg': '#ffffff', 'bad name': 'red' },
      font: { family: 'Inter"; x', size: 13 },
      editorFont: { family: 'JetBrains Mono' },
    });
    expect(root.dataset.ideTheme).toBe('dark');
    expect(root.style.getPropertyValue('--ide-bg')).toBe('#2b2d30');
    expect(root.style.getPropertyValue('--ide-button-fg')).toBe('#ffffff');
    expect(root.getAttribute('style')).not.toContain('bad');
    expect(root.style.getPropertyValue('--ide-font')).toMatch(/^"Inter x", /);
    expect(root.style.getPropertyValue('--ide-font-size')).toBe('13px');
    expect(root.style.getPropertyValue('--ide-mono-font')).toMatch(/^"JetBrains Mono", /);
  });

  it('follows the VS Code body class', async () => {
    const root = document.createElement('html');
    const body = document.createElement('body');
    body.className = 'vscode-light';
    const stop = watchVsCodeTheme(root, body);
    expect(root.dataset.ideTheme).toBe('light');

    body.className = 'vscode-dark';
    await Promise.resolve();
    expect(root.dataset.ideTheme).toBe('dark');

    body.className = 'vscode-high-contrast';
    await Promise.resolve();
    expect(root.dataset.ideTheme).toBe('high-contrast');
    stop();
  });
});
