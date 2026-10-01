/**
 * Local AI model that is downloaded instead of packaged.
 *
 * No Redacto build ships the NER model: it is downloaded from the project's
 * Hugging Face repository on first use, checked against the SHA-256 in the
 * repository's `redacto-model.json`, and kept locally. Only model files are
 * downloaded; pasted text never leaves the device. Where the model comes from
 * is set per build (`MODEL_SOURCE`, webpack DefinePlugin):
 *
 * - `huggingface` (Chrome, Edge, Firefox): the background downloads it
 *   (src/background/local-ai-model-downloader.ts) into the extension's Cache
 *   Storage. `modelAwareFetch` answers the model's `chrome-extension://…/models/…`
 *   URLs, the ones a packaged model would have, from that cache.
 * - `host` (IDE plugins): the plugin host downloads it into its own data
 *   folder and serves it to the webview; the host's progress arrives as
 *   `model` messages (src/ide/host-model.ts). `modelAwareFetch` redirects the
 *   model URLs to where the host serves the ready model.
 * - `bundled` (the web page, which serves the model next to itself, and
 *   tests): the model is a plain asset; nothing is downloaded.
 *
 * Either way `modelAwareFetch` is the only thing the model loader changes, so
 * model loading is the same code everywhere.
 */

import { DEFAULT_NER_MODEL, NER_MODELS } from './constants';

/** Folder of the downloaded model, as in a packaged build (`models/ner/…`). */
export const DOWNLOADED_MODEL_ASSET_ROOT = NER_MODELS.find((model) => model.key === DEFAULT_NER_MODEL)!.assetBasePath;

declare const __REDACTO_MODEL_SOURCE__: string | undefined;
declare const __REDACTO_MODEL_HF_REPO__: string | undefined;
declare const __REDACTO_MODEL_REVISION__: string | undefined;

export type ModelSource = 'bundled' | 'huggingface' | 'host';

/** Set per build by webpack (DefinePlugin); absent in tests. */
export const MODEL_SOURCE: ModelSource =
  typeof __REDACTO_MODEL_SOURCE__ !== 'undefined'
  && (__REDACTO_MODEL_SOURCE__ === 'huggingface' || __REDACTO_MODEL_SOURCE__ === 'host')
    ? __REDACTO_MODEL_SOURCE__
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
  /** IDE plugins: where the host serves the ready model (`…/<version>/`). */
  baseUrl?: string;
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

/** True where the model is downloaded at runtime (every build but the web page). */
export function modelDownloadsEnabled(): boolean {
  return MODEL_SOURCE !== 'bundled';
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

/**
 * The Cache Storage key of a downloaded model file. Chrome's Cache API only
 * takes http(s) URLs, not `chrome-extension://` ones, so the files are kept
 * under this fixed, never-fetched (`.invalid`) origin; `modelAwareFetch`
 * maps the model's extension URLs to it.
 */
export function modelCacheKey(path: string): string {
  return `https://local-ai-model.redacto.invalid/${path}`;
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
 * A complete model version's cache holds its `redacto-model.json` too, written
 * after every file is verified: it marks the version as usable. The model
 * loader (the offscreen document in Chrome, which has no `chrome.storage`)
 * finds the ready model by this marker alone.
 */
export function modelCompleteMarkerUrl(): string {
  return modelCacheKey(MODEL_MANIFEST_FILE);
}

async function readyModelCache(): Promise<Cache | null> {
  for (const name of await caches.keys()) {
    if (!isModelCacheName(name)) continue;
    const cache = await caches.open(name);
    if (await cache.match(modelCompleteMarkerUrl())) return cache;
  }
  return null;
}

function notDownloaded(): Response {
  return new Response(null, { status: 404, statusText: 'Local AI model not downloaded' });
}

/**
 * `fetch` for the model loader. In a download build, requests for the model's
 * extension URLs are answered from the ready model (404 while it is not
 * there): from the extension cache, or, in the IDE plugins, from where the
 * host serves it. Every other request goes to the network as usual.
 */
export async function modelAwareFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const modelRoot = modelDownloadsEnabled() ? chrome.runtime.getURL(`${DOWNLOADED_MODEL_ASSET_ROOT}/`) : null;
  if (!modelRoot || !url.startsWith(modelRoot)) {
    return fetch(input, init);
  }

  if (MODEL_SOURCE === 'host') {
    const { readyVersion, baseUrl } = await loadModelDownloadState();
    if (!readyVersion || !baseUrl) return notDownloaded();
    return fetch(new URL(url.slice(modelRoot.length), baseUrl).href, init);
  }

  const cached = await (await readyModelCache())?.match(modelCacheKey(url.slice(modelRoot.length)));
  if (!cached) return notDownloaded();
  if ((init?.method ?? 'GET').toUpperCase() === 'HEAD') {
    return new Response(null, { status: 200, headers: cached.headers });
  }
  return cached;
}
