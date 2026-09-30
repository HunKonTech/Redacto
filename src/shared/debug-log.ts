/**
 * Console output gated by the Debug mode toggle (`settings.debug`).
 *
 * Nothing in the extension writes to the browser console directly: every
 * log goes through here, so the console stays silent unless the user turns
 * Debug mode on in Settings → Debug.
 */
const SETTINGS_KEY = 'pg_settings';

let debugEnabled = false;
let initialized = false;

function readDebugFromSettings(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { debug?: unknown }).debug);
}

export function initDebugFlag(): void {
  if (initialized) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  initialized = true;

  void Promise.resolve(chrome.storage.local.get(SETTINGS_KEY))
    .then((result) => {
      debugEnabled = readDebugFromSettings(result?.[SETTINGS_KEY]);
    })
    .catch(() => {});

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    debugEnabled = readDebugFromSettings(changes[SETTINGS_KEY].newValue);
  });
}

export function setDebugEnabled(value: boolean): void {
  debugEnabled = value;
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

export function debugLog(...args: unknown[]): void {
  if (debugEnabled) console.log(...args);
}

export function debugTrace(...args: unknown[]): void {
  if (debugEnabled) console.debug(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (debugEnabled) console.warn(...args);
}

export function debugError(...args: unknown[]): void {
  if (debugEnabled) console.error(...args);
}

initDebugFlag();
