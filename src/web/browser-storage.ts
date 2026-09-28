/**
 * Privacy Guardrail — the web page's storage
 *
 * Plays the IDE host's part for the web page (web-app.ts): seeds the
 * `chrome.storage` shim from this browser's Web Storage and writes its
 * changes back. `local` is `localStorage`, `session` is `sessionStorage`.
 * Nothing leaves the browser.
 */

import type { StorageAreaName, StorageSnapshot, WebviewToHost } from '../ide/protocol';

/** Keys are prefixed: every Pages site of the same owner shares this origin's storage. */
const PREFIX = 'privacy-guardrail:';

function backing(area: StorageAreaName): Storage | null {
  try {
    return (area === 'local' ? globalThis.localStorage : globalThis.sessionStorage) ?? null;
  } catch {
    // Storage blocked (e.g. cookies disabled): keep everything in memory.
    return null;
  }
}

export function readArea(area: StorageAreaName): StorageSnapshot {
  const store = backing(area);
  const snapshot: StorageSnapshot = {};
  if (!store) return snapshot;
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      snapshot[key.slice(PREFIX.length)] = JSON.parse(store.getItem(key) ?? 'null');
    } catch {
      // A value this page did not write; skip it.
    }
  }
  return snapshot;
}

export function persist(message: WebviewToHost): void {
  if (message.type !== 'storage.set' && message.type !== 'storage.remove') return;
  const store = backing(message.area);
  if (!store) return;
  try {
    if (message.type === 'storage.set') {
      for (const [key, value] of Object.entries(message.items)) {
        if (value === undefined) store.removeItem(PREFIX + key);
        else store.setItem(PREFIX + key, JSON.stringify(value));
      }
    } else {
      for (const key of message.keys) store.removeItem(PREFIX + key);
    }
  } catch (err) {
    // Quota exceeded: the in-memory copy stays current for this visit.
    console.warn('[PG:web] could not persist storage', err);
  }
}
