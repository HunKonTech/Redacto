/**
 * Local AI model that is downloaded instead of packaged.
 *
 * The Chrome and Edge packages ship the NER model inside the extension. The
 * Firefox package cannot: addons.mozilla.org rejects files over 200 MB. There
 * the model is downloaded from Hugging Face on first use, checked against the
 * SHA-256 in the repository's `redacto-model.json`, and kept in the
 * extension's Cache Storage under the same `moz-extension://…/models/…` URLs a
 * packaged model would have. `modelAwareFetch` serves those URLs from the
 * cache, so the model loading code is the same for both.
 *
 * Only model files are downloaded. Pasted text never leaves the browser.
 */

import { DEFAULT_NER_MODEL, NER_MODELS } from './constants';

/** Folder of the downloaded model, as in a packaged build (`models/ner/…`). */
export const DOWNLOADED_MODEL_ASSET_ROOT = NER_MODELS.find((model) => model.key === DEFAULT_NER_MODEL)!.assetBasePath;

declare const __REDACTO_MODEL_SOURCE__: string | undefined;
declare const __REDACTO_MODEL_HF_REPO__: string | undefined;
declare const __REDACTO_MODEL_REVISION__: string | undefined;

/** Set per build by webpack (DefinePlugin); absent in tests. */
export const MODEL_SOURCE: 'bundled' | 'huggingface' =
  typeof __REDACTO_MODEL_SOURCE__ !== 'undefined' && __REDACTO_MODEL_SOURCE__ === 'huggingface'
    ? 'huggingface'
    : 'bundled';
export const MODEL_HF_REPO =
  typeof __REDACTO_MODEL_HF_REPO__ !== 'undefined' && __REDACTO_MODEL_HF_REPO__
    ? __REDACTO_MODEL_HF_REPO__
    : 'koncsik/redacto-eu-pii-ner-q4f16';
/** A commit SHA pins the model a release was tested with; `main` follows the repo. */
export const MODEL_REVISION =
  typeof __REDACTO_MODEL_REVISION__ !== 'undefined' && __REDACTO_MODEL_REVISION__
    ? __REDACTO_MODEL_REVISION__
    : 'main';

export const MODEL_MANIFEST_FILE = 'redacto-model.json';
export const MODEL_DOWNLOAD_STATE_KEY = 'pg_model_download';
const CACHE_PREFIX = 'redacto-local-ai-model-';

export type ModelDownloadPhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'failed';

export interface ModelDownloadState {
  /** Model version whose files are complete in the cache and in use. */
  readyVersion?: string;
  phase: ModelDownloadPhase;
  /** Version being downloaded (an update keeps `readyVersion` usable meanwhile). */
  targetVersion?: string;
  receivedBytes: number;
  totalBytes: number;
  error?: string;
  /** Extension version that last completed an update check. */
  checkedExtensionVersion?: string;
  updatedAt: number;
}

export interface ModelManifestFile {
  /** Path relative to the model folder, e.g. `onnx/model_q4f16.onnx`. */
  path: string;
  size: number;
  sha256: string;
}

export interface ModelManifest {
  format: 1;
  version: string;
  files: ModelManifestFile[];
}

export const INITIAL_MODEL_DOWNLOAD_STATE: ModelDownloadState = {
  phase: 'idle',
  receivedBytes: 0,
  totalBytes: 0,
  updatedAt: 0,
};

export function modelDownloadsEnabled(): boolean {
  return MODEL_SOURCE === 'huggingface';
}

export function modelCacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

export function isModelCacheName(name: string): boolean {
  return name.startsWith(CACHE_PREFIX);
}

export function huggingFaceFileUrl(path: string, repo = MODEL_HF_REPO, revision = MODEL_REVISION): string {
  return `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision)}/${path}`;
}

/** The extension URL a packaged copy of this model file would have. */
export function extensionModelUrl(path: string): string {
  return chrome.runtime.getURL(`${DOWNLOADED_MODEL_ASSET_ROOT}/${path}`);
}

export async function loadModelDownloadState(): Promise<ModelDownloadState> {
  const stored = await chrome.storage.local.get(MODEL_DOWNLOAD_STATE_KEY);
  return { ...INITIAL_MODEL_DOWNLOAD_STATE, ...(stored?.[MODEL_DOWNLOAD_STATE_KEY] ?? {}) };
}

export function modelDownloadPercent(state: Pick<ModelDownloadState, 'receivedBytes' | 'totalBytes'>): number {
  if (state.totalBytes <= 0) return 0;
  return Math.min(100, Math.floor((state.receivedBytes / state.totalBytes) * 100));
}

export function isModelDownloadActive(state: ModelDownloadState): boolean {
  return state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'verifying';
}

/** One-line status for the popup and the Local AI status message. */
export function modelDownloadMessage(state: ModelDownloadState): string {
  const updating = Boolean(state.readyVersion);
  switch (state.phase) {
    case 'checking':
      return updating ? 'Checking for a newer Local AI model…' : 'Preparing the Local AI model download…';
    case 'downloading':
      return `${updating ? 'Updating' : 'Downloading'} the Local AI model: ${modelDownloadPercent(state)}% (${formatMegabytes(state.receivedBytes)} of ${formatMegabytes(state.totalBytes)})`;
    case 'verifying':
      return 'Verifying the downloaded Local AI model…';
    case 'failed':
      return updating
        ? `Could not check for a newer Local AI model (${state.error ?? 'unknown error'}). The current model stays in use.`
        : `Local AI model download failed: ${state.error ?? 'unknown error'}`;
    default:
      return state.readyVersion ? 'Local AI model is ready.' : 'The Local AI model has not been downloaded yet.';
  }
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * `fetch` for the model loader. In a download build, requests for the model's
 * extension URLs are answered from the cache of the ready version (404 when
 * the model is not there yet); every other request goes to the network as
 * usual.
 */
export async function modelAwareFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!modelDownloadsEnabled() || !url.startsWith(chrome.runtime.getURL(`${DOWNLOADED_MODEL_ASSET_ROOT}/`))) {
    return fetch(input, init);
  }

  const { readyVersion } = await loadModelDownloadState();
  const cached = readyVersion ? await (await caches.open(modelCacheName(readyVersion))).match(url) : undefined;
  if (!cached) return new Response(null, { status: 404, statusText: 'Local AI model not downloaded' });
  if ((init?.method ?? 'GET').toUpperCase() === 'HEAD') {
    return new Response(null, { status: 200, headers: cached.headers });
  }
  return cached;
}
