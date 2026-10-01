/**
 * Redacto — `chrome.*` for the IDE webview
 *
 * The side panel and the detection pipeline are written against the extension
 * APIs. Inside an IDE webview there is no extension, so this provides the part
 * they use:
 *
 * - `chrome.storage.local` / `.session` / `.onChanged`: kept in memory, seeded
 *   from the host's snapshot and written through to it, so History and the
 *   identity vault survive the webview (and, for `local`, the IDE).
 * - `chrome.runtime.sendMessage`: answered in-page by the offscreen handler —
 *   the service worker's settings merge first, as it does for the extension.
 * - `chrome.runtime.getURL`: the webview's own asset folder.
 */

import type { StorageAreaName, StorageSnapshot, WebviewToHost } from './protocol';
import { debugError } from '../shared/debug-log';

type ChangeListener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void;

export type MessageHandler = (message: unknown) => Promise<unknown>;

export interface ShimOptions {
  /** URL of the page (or its folder) the extension's asset paths (`wasm/…`, `models/…`) resolve against. */
  assetBase: string;
  storage: Partial<Record<StorageAreaName, StorageSnapshot>>;
  post: (message: WebviewToHost) => void;
  handleMessage: MessageHandler;
  /** `local` keys kept in this page only, never written to the host (e.g. download progress). */
  volatileKeys?: string[];
}

function pick(data: Map<string, unknown>, keys?: string | string[] | Record<string, unknown> | null): StorageSnapshot {
  if (keys === undefined || keys === null) return Object.fromEntries(data);
  if (typeof keys === 'string') keys = [keys];
  const result: StorageSnapshot = {};
  if (Array.isArray(keys)) {
    for (const key of keys) if (data.has(key)) result[key] = data.get(key);
    return result;
  }
  for (const [key, fallback] of Object.entries(keys)) result[key] = data.has(key) ? data.get(key) : fallback;
  return result;
}

/** Values cross the host boundary as JSON; copy them so callers can't mutate stored state. */
function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function createArea(
  name: StorageAreaName,
  initial: StorageSnapshot | undefined,
  post: ShimOptions['post'],
  emit: (changes: Parameters<ChangeListener>[0], area: StorageAreaName) => void,
  volatileKeys: ReadonlySet<string> = new Set(),
) {
  const persisted = (key: string): boolean => !volatileKeys.has(key);
  const data = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    async get(keys?: string | string[] | Record<string, unknown> | null): Promise<StorageSnapshot> {
      return clone(pick(data, keys));
    },
    async set(items: StorageSnapshot): Promise<void> {
      const copy = clone(items);
      const changes: Parameters<ChangeListener>[0] = {};
      for (const [key, value] of Object.entries(copy)) {
        changes[key] = { oldValue: data.get(key), newValue: value };
        data.set(key, value);
      }
      const written = Object.fromEntries(Object.entries(copy).filter(([key]) => persisted(key)));
      if (Object.keys(written).length > 0) post({ type: 'storage.set', area: name, items: written });
      emit(changes, name);
    },
    async remove(keys: string | string[]): Promise<void> {
      const list = typeof keys === 'string' ? [keys] : keys;
      const changes: Parameters<ChangeListener>[0] = {};
      for (const key of list) {
        if (!data.has(key)) continue;
        changes[key] = { oldValue: data.get(key) };
        data.delete(key);
      }
      const removed = Object.keys(changes);
      if (removed.length === 0) return;
      const written = removed.filter(persisted);
      if (written.length > 0) post({ type: 'storage.remove', area: name, keys: written });
      emit(changes, name);
    },
    async clear(): Promise<void> {
      await this.remove([...data.keys()]);
    },
    async setAccessLevel(): Promise<void> {},
  };
}

export function createChromeShim(options: ShimOptions) {
  const listeners = new Set<ChangeListener>();
  const emit = (changes: Parameters<ChangeListener>[0], area: StorageAreaName): void => {
    for (const listener of listeners) {
      try {
        listener(changes, area);
      } catch (err) {
        debugError('[PG:ide] storage listener failed', err);
      }
    }
  };
  const base = new URL('.', options.assetBase).href;

  return {
    storage: {
      local: createArea('local', options.storage.local, options.post, emit, new Set(options.volatileKeys)),
      session: createArea('session', options.storage.session, options.post, emit),
      onChanged: {
        addListener: (listener: ChangeListener) => void listeners.add(listener),
        removeListener: (listener: ChangeListener) => void listeners.delete(listener),
        hasListener: (listener: ChangeListener) => listeners.has(listener),
      },
    },
    runtime: {
      id: 'privacy-guardrail-ide',
      getURL: (path: string) => new URL(path.replace(/^\//, ''), base).href,
      sendMessage: (message: unknown) => options.handleMessage(message),
      onMessage: { addListener() {}, removeListener() {} },
    },
  };
}

/**
 * Put the shim on `target.chrome`, keeping what is already there (WebView2
 * keeps its `chrome.webview` bridge on the same object).
 */
export function installChromeShim(target: { chrome?: unknown }, shim: ReturnType<typeof createChromeShim>): void {
  const existing = (target.chrome && typeof target.chrome === 'object' ? target.chrome : {}) as Record<string, unknown>;
  Object.assign(existing, shim);
  target.chrome = existing;
}
