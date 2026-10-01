/**
 * Redacto — the local AI model's offline copy on the web page
 *
 * The page serves the model from its own folder; the service worker (sw.js)
 * keeps a copy in Cache Storage for offline use. This store follows that
 * copy (files, size, when it was saved, a running save/refresh/delete) for
 * the Settings tab, and sends the page's requests to the worker.
 */

import { readable, type Readable } from 'svelte/store';

export type OfflineModelTask = 'cache-models' | 'refresh-models' | 'delete-models';

export interface OfflineStatus {
  type: 'offline-status';
  modelFiles: number;
  modelFilesCached: number;
  /** Bytes of the model files in the cache, and of all of them. */
  cachedBytes?: number;
  totalBytes?: number;
  /** When the cache last got a model file. */
  cachedAt?: number;
  /** Hash of this build's model files, and the site version. */
  modelVersion?: string;
  siteVersion?: string;
  /** The save, refresh or delete running in the worker. */
  busy?: OfflineModelTask;
  error?: string;
}

export function isOfflineStatus(value: unknown): value is OfflineStatus {
  return (value as OfflineStatus | null)?.type === 'offline-status';
}

/** `null` until the worker answers, or for good where there is no service worker. */
export const offlineModelStatus: Readable<OfflineStatus | null> = readable<OfflineStatus | null>(null, (set) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  const onMessage = (event: MessageEvent): void => {
    if (isOfflineStatus(event.data)) set(event.data);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: 'offline-status' }));
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
});

export async function runOfflineModelTask(task: OfflineModelTask): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  if (task === 'cache-models' || task === 'refresh-models') {
    // Ask the browser not to evict the (large) model under storage pressure.
    await navigator.storage?.persist?.().catch(() => false);
  }
  if (task === 'refresh-models') {
    // Also look for a newer version of the page itself; it takes over on its own.
    void registration.update().catch(() => undefined);
  }
  registration.active?.postMessage({ type: task });
}
