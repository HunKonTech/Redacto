/**
 * Redacto — UI translations
 *
 * A small dictionary-based i18n layer shared by the popup, the side panel,
 * the options page and the web page. English (`en`) is the source dictionary:
 * every key exists there, and any key another dictionary lacks falls back to
 * it, so a partial (for example machine-translated) dictionary is safe to
 * register at runtime with `registerMessages`.
 *
 * English and Hungarian are bundled. Every other language is machine-translated
 * (scripts/i18n/machine-translate.js) into ./generated/locales/<code>.json,
 * which the builds copy to `i18n/`; `setLocale` fetches it the first time the
 * language is used, showing English until it arrives.
 *
 * Messages use `{name}` placeholders. Plurals are separate keys with
 * `_one` / `_other` suffixes (Intl.PluralRules categories), picked by `plural`.
 *
 * Plain TypeScript with no Svelte import, so shared modules and tests can
 * use it; components use the reactive wrappers in ./reactive.
 */

import en from './locales/en';
import hu from './locales/hu';
import { GENERATED_LOCALES, GENERATED_LOCALE_NAMES } from './generated';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type MessageParams = Record<string, string | number>;

/** Base keys that have `_one` / `_other` variants. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

export const SUPPORTED_LOCALES = ['en', 'hu', ...GENERATED_LOCALES] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = Locale | 'auto';

/** Each language's own name, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  hu: 'Magyar',
  ...GENERATED_LOCALE_NAMES,
};

/** Browser language tags (lower case) that mean one of the supported languages. */
const LOCALE_ALIASES: Record<string, string> = {
  iw: 'he',
  jw: 'jv',
  tl: 'fil',
  nb: 'no',
  nn: 'no',
  'zh-cn': 'zh',
  'zh-sg': 'zh',
  'zh-hans': 'zh',
  'zh-tw': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
  'zh-hant': 'zh-TW',
};

const dictionaries: Record<string, Partial<Messages>> = { en, hu };
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

let current: Locale = detectLocale();

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** The supported language a browser tag such as `zh-Hant-TW` or `de-AT` means, if any. */
function matchLocale(tag: string): Locale | undefined {
  const parts = tag.toLowerCase().split(/[-_]/);
  // Most specific first: `zh-hant-tw`, `zh-hant`, `zh`.
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('-');
    const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === candidate);
    if (exact) return exact;
    const alias = LOCALE_ALIASES[candidate];
    if (isSupportedLocale(alias)) return alias;
  }
  return undefined;
}

/** The first supported language in the browser's list, else English. */
export function detectLocale(languages?: readonly string[]): Locale {
  const list =
    languages ??
    (typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
  for (const tag of list) {
    const locale = tag ? matchLocale(tag) : undefined;
    if (locale) return locale;
  }
  return 'en';
}

export function resolveLocale(preference: LocalePreference | undefined, languages?: readonly string[]): Locale {
  return preference && preference !== 'auto' && isSupportedLocale(preference) ? preference : detectLocale(languages);
}

export function getLocale(): Locale {
  return current;
}

/** Where a machine-translated dictionary is served: `i18n/<code>.json` next to the page. */
function dictionaryUrl(locale: Locale): string {
  const path = `i18n/${locale}.json`;
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(path);
  return new URL(path, typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').href;
}

/**
 * Fetches a machine-translated dictionary once; bundled languages and ones
 * already loaded resolve at once. On failure the language stays in English
 * and the next `setLocale` tries again.
 */
export function loadLocale(locale: Locale): Promise<void> {
  if (dictionaries[locale] || !isSupportedLocale(locale)) return Promise.resolve();
  let pending = loading.get(locale);
  if (!pending) {
    pending = fetch(dictionaryUrl(locale))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Partial<Messages>>;
      })
      .then((messages) => registerMessages(locale, messages))
      .catch((error: unknown) => {
        loading.delete(locale);
        console.warn(`[i18n] Could not load the ${locale} dictionary:`, error);
      });
    loading.set(locale, pending);
  }
  return pending;
}

export function setLocale(locale: Locale): void {
  void loadLocale(locale);
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
