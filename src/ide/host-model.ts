/**
 * Redacto — the Local AI model in the IDE webview
 *
 * The plugin host downloads the model (protocol.ts: `HostModelState`,
 * docs/developer/model-download.md). This page keeps the host's state under
 * `MODEL_DOWNLOAD_STATE_KEY` in its `chrome.storage.local` (not written back
 * to the host), where the panel's download status and `modelAwareFetch` read
 * it, and asks the host for the model whenever Local AI is on.
 *
 * Until the model is ready, detection runs pattern-only and the Local AI
 * status reports the download, as in the browser extension.
 */

import type { DetectionOptions, NerStatusResponse } from '../shared/message-types';
import {
  INITIAL_MODEL_DOWNLOAD_STATE,
  loadModelDownloadState,
  MODEL_DOWNLOAD_STATE_KEY,
  MODEL_SOURCE,
  modelDownloadMessage,
} from '../shared/local-ai-model-download';
import { loadSettings } from '../shared/storage';
import type { HostModelState, WebviewToHost } from './protocol';

const SETTINGS_KEY = 'pg_settings';
/** After a failed download, detection asks again at most this often. */
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;

let post: ((message: WebviewToHost) => void) | null = null;

export function hostModelEnabled(): boolean {
  return MODEL_SOURCE === 'host';
}

export async function applyHostModelState(state: HostModelState): Promise<void> {
  await chrome.storage.local.set({
    [MODEL_DOWNLOAD_STATE_KEY]: { ...INITIAL_MODEL_DOWNLOAD_STATE, ...state, updatedAt: Date.now() },
  });
}

/** Ask the host for the model (downloads it when missing, retries a failure). */
export function requestHostModel(): void {
  if (hostModelEnabled()) post?.({ type: 'model.download' });
}

/**
 * Call once the `chrome.*` shim is installed. Stores what the host reported
 * in `init`, and asks for the model now and whenever Local AI is switched on.
 */
export async function connectHostModel(send: (message: WebviewToHost) => void, initial?: HostModelState): Promise<void> {
  if (!hostModelEnabled()) return;
  post = send;
  if (initial) await applyHostModelState(initial);
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = area === 'local' ? changes[SETTINGS_KEY] : undefined;
    const before = (change?.oldValue as { nerProvider?: string } | undefined)?.nerProvider;
    const after = (change?.newValue as { nerProvider?: string } | undefined)?.nerProvider;
    if (change && before === 'off' && after !== 'off') requestHostModel();
  });
  if ((await loadSettings()).nerProvider !== 'off') requestHostModel();
}

/** True while Local AI is on but its model is not downloaded yet. */
export async function hostModelPending(config: DetectionOptions): Promise<boolean> {
  if (!hostModelEnabled() || config.ner_provider === 'off') return false;
  const state = await loadModelDownloadState();
  if (state.readyVersion && state.baseUrl) return false;
  if (state.phase === 'failed' && Date.now() - state.updatedAt > RETRY_AFTER_FAILURE_MS) requestHostModel();
  return true;
}

export async function hostModelNerStatus(config: DetectionOptions): Promise<NerStatusResponse> {
  return {
    type: 'NER_STATUS',
    payload: {
      mode: config.ner_provider ?? 'transformers',
      state: 'loading',
      message: modelDownloadMessage(await loadModelDownloadState()),
    },
  };
}
