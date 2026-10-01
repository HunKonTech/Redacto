/**
 * The Local AI model download state as a Svelte store, kept current from
 * `chrome.storage` for as long as something is subscribed. Shared by the
 * progress bar, the popup's settings and the options page's model card.
 */

import { readable, type Readable } from 'svelte/store';
import {
  INITIAL_MODEL_DOWNLOAD_STATE,
  loadModelDownloadState,
  MODEL_DOWNLOAD_STATE_KEY,
  modelDownloadsEnabled,
  type ModelDownloadState,
} from './local-ai-model-download';

export const modelDownloadState: Readable<ModelDownloadState> = readable(INITIAL_MODEL_DOWNLOAD_STATE, (set) => {
  if (!modelDownloadsEnabled()) return undefined;
  void loadModelDownloadState().then(set).catch(() => undefined);
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && changes[MODEL_DOWNLOAD_STATE_KEY]) {
      set({ ...INITIAL_MODEL_DOWNLOAD_STATE, ...changes[MODEL_DOWNLOAD_STATE_KEY].newValue });
    }
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
});

/** Starts the download, or with `checkNow`, also looks for a newer model. */
export function requestModelDownload(checkNow = false): void {
  void chrome.runtime.sendMessage({ type: 'DOWNLOAD_LOCAL_AI_MODEL', payload: { checkNow } });
}

export function requestModelDelete(): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: 'DELETE_LOCAL_AI_MODEL' });
}
