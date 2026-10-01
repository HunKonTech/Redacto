/**
 * Reactive i18n for Svelte components: reading a message through these
 * functions inside markup or `$derived` re-runs it when the language changes.
 */

import { createSubscriber } from 'svelte/reactivity';
import {
  formatDate,
  formatTime,
  getLocale,
  onLocaleChange,
  translate,
  translatePlural,
  type Locale,
  type MessageKey,
  type MessageParams,
  type PluralKey,
} from './index';
import { getUiPrefs, onUiPrefsChange, type UiPrefs } from '../ui-prefs';

const track = createSubscriber((update) => onLocaleChange(update));
const trackPrefs = createSubscriber((update) => onUiPrefsChange(update));

/** The stored theme and language preferences. */
export function uiPrefs(): UiPrefs {
  trackPrefs();
  return getUiPrefs();
}

export function t(key: MessageKey, params?: MessageParams): string {
  track();
  return translate(key, params);
}

export function tp(key: PluralKey, count: number, params?: MessageParams): string {
  track();
  return translatePlural(key, count, params);
}

export function locale(): Locale {
  track();
  return getLocale();
}

export function date(timestamp: number, options: Intl.DateTimeFormatOptions): string {
  track();
  return formatDate(timestamp, options);
}

export function time(timestamp: number, options: Intl.DateTimeFormatOptions): string {
  track();
  return formatTime(timestamp, options);
}
