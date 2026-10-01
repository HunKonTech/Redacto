/**
 * Redacto — appearance and language preferences
 *
 * The theme (system / light / dark) and the UI language (auto / en / hu) the
 * popup, side panel, options page and web page share. Kept in
 * `chrome.storage.local` so every open view follows a change, and mirrored to
 * `localStorage` so a page can paint in the right theme before the async
 * storage read finishes.
 *
 * The theme is applied as `data-theme` on <html>; tokens.css does the rest.
 * IDE webviews follow the IDE's own theme and never call `applyTheme`.
 */

import { resolveLocale, setLocale, type LocalePreference, isSupportedLocale } from './i18n';

export type ThemePreference = 'system' | 'light' | 'dark';
export type UiPrefs = { theme: ThemePreference; locale: LocalePreference };

export const UI_PREFS_STORAGE_KEY = 'pg_ui_prefs';
const MIRROR_KEY = 'redacto:ui-prefs';

export const DEFAULT_UI_PREFS: UiPrefs = { theme: 'system', locale: 'auto' };

const listeners = new Set<() => void>();
let current: UiPrefs = { ...DEFAULT_UI_PREFS };
let applyThemeToDocument = true;

export function normalizeUiPrefs(value: unknown): UiPrefs {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<UiPrefs>;
  const theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : DEFAULT_UI_PREFS.theme;
  const locale = raw.locale === 'auto' || isSupportedLocale(raw.locale) ? raw.locale : DEFAULT_UI_PREFS.locale;
  return { theme, locale };
}

function readMirror(): UiPrefs | null {
  try {
    const stored = globalThis.localStorage?.getItem(MIRROR_KEY);
    return stored ? normalizeUiPrefs(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function writeMirror(prefs: UiPrefs): void {
  try {
    globalThis.localStorage?.setItem(MIRROR_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the preference still lives in chrome.storage.
  }
}

export function applyTheme(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

function apply(prefs: UiPrefs): void {
  current = prefs;
  if (applyThemeToDocument) applyTheme(prefs.theme);
  setLocale(resolveLocale(prefs.locale));
  for (const listener of listeners) listener();
}

export function getUiPrefs(): UiPrefs {
  return current;
}

export function onUiPrefsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveUiPrefs(patch: Partial<UiPrefs>): Promise<void> {
  const next = normalizeUiPrefs({ ...current, ...patch });
  writeMirror(next);
  apply(next);
  try {
    await chrome.storage.local.set({ [UI_PREFS_STORAGE_KEY]: next });
  } catch {
    // No extension storage (e.g. a test page): the mirror keeps it.
  }
}

/**
 * Applies the stored preferences and follows later changes. Call once per
 * page, before mounting the UI. `theme: false` leaves the theme to the host
 * (the IDE webviews).
 */
export function initUiPrefs(options: { theme?: boolean } = {}): void {
  applyThemeToDocument = options.theme !== false;
  apply(readMirror() ?? current);

  const storage = typeof chrome !== 'undefined' ? chrome.storage : undefined;
  if (!storage?.local) return;
  void storage.local
    .get(UI_PREFS_STORAGE_KEY)
    .then((items) => {
      if (!items?.[UI_PREFS_STORAGE_KEY]) return;
      const stored = normalizeUiPrefs(items[UI_PREFS_STORAGE_KEY]);
      writeMirror(stored);
      apply(stored);
    })
    .catch(() => undefined);
  storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[UI_PREFS_STORAGE_KEY]) return;
    const next = normalizeUiPrefs(changes[UI_PREFS_STORAGE_KEY].newValue);
    writeMirror(next);
    apply(next);
  });
}
