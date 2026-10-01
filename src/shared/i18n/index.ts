/**
 * Redacto — UI translations
 *
 * A small dictionary-based i18n layer shared by the popup, the side panel,
 * the options page and the web page. English (`en`) is the source dictionary:
 * every key exists there, and any key another dictionary lacks falls back to
 * it, so a partial (for example machine-translated) dictionary is safe to
 * register at runtime with `registerMessages`.
 *
 * Messages use `{name}` placeholders. Plurals are separate keys with
 * `_one` / `_other` suffixes (Intl.PluralRules categories), picked by `plural`.
 *
 * Plain TypeScript with no Svelte import, so shared modules and tests can
 * use it; components use the reactive wrappers in ./reactive.
 */

import en from './locales/en';
import hu from './locales/hu';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type MessageParams = Record<string, string | number>;

/** Base keys that have `_one` / `_other` variants. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

export const SUPPORTED_LOCALES = ['en', 'hu'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = Locale | 'auto';

/** Each language's own name, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  hu: 'Magyar',
};

const dictionaries: Record<string, Partial<Messages>> = { en, hu };
const listeners = new Set<() => void>();

let current: Locale = detectLocale();

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** The first supported language in the browser's list, else English. */
export function detectLocale(languages?: readonly string[]): Locale {
  const list =
    languages ??
    (typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
  for (const tag of list) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isSupportedLocale(base)) return base;
  }
  return 'en';
}

export function resolveLocale(preference: LocalePreference | undefined, languages?: readonly string[]): Locale {
  return preference && preference !== 'auto' && isSupportedLocale(preference) ? preference : detectLocale(languages);
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const listener of listeners) listener();
}

/** Called after every language change; returns the unsubscribe function. */
export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Adds or overrides messages for a language, e.g. from a later automatic
 * translation step. Keys it lacks keep falling back to English.
 */
export function registerMessages(locale: Locale, messages: Partial<Messages>): void {
  dictionaries[locale] = { ...dictionaries[locale], ...messages };
  if (locale === current) for (const listener of listeners) listener();
}

function interpolate(message: string, params?: MessageParams): string {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function translate(key: MessageKey, params?: MessageParams): string {
  const message = dictionaries[current]?.[key] ?? en[key] ?? key;
  return interpolate(message, params);
}

/** `{count}` is filled in; other params as for `translate`. */
export function translatePlural(key: PluralKey, count: number, params?: MessageParams): string {
  const category = new Intl.PluralRules(current).select(count);
  const variant = `${key}_${category}` as MessageKey;
  const exists = (dictionaries[current]?.[variant] ?? en[variant]) !== undefined;
  const chosen = exists ? variant : (`${key}_other` as MessageKey);
  return translate(chosen, { count, ...params });
}

/** Dates and times in the UI language. */
export function formatDate(timestamp: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(timestamp).toLocaleDateString(current, options);
}

export function formatTime(timestamp: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(timestamp).toLocaleTimeString(current, options);
}

/** Message keys for a detection category group's name and description. */
export function groupLabelKey(group: string): MessageKey {
  return `category.${group}` as MessageKey;
}

export function groupDescriptionKey(group: string): MessageKey {
  return `category.${group}.description` as MessageKey;
}
