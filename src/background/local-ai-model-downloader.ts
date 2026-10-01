/**
 * Downloads the Local AI model from Hugging Face in the browser extension
 * (Chrome, Edge, Firefox), see src/shared/local-ai-model-download.ts.
 *
 * - First use: every file in `redacto-model.json` is downloaded, checked
 *   against its size and SHA-256, and stored in a cache named after the model
 *   version. The manifest itself goes in last and marks the cache complete;
 *   only a complete, verified version becomes `readyVersion`.
 * - Each new extension version checks the manifest again; a newer model is
 *   downloaded next to the old one, which stays in use until the new one is
 *   complete. Older caches are then removed.
 * - Progress is written to storage (MODEL_DOWNLOAD_STATE_KEY) for the popup
 *   and the toolbar badge.
 */

import {
  huggingFaceFileUrl,
  INITIAL_MODEL_DOWNLOAD_STATE,
  modelCompleteMarkerUrl,
  isModelCacheName,
  loadModelDownloadState,
  MODEL_DOWNLOAD_STATE_KEY,
  MODEL_MANIFEST_FILE,
  MODEL_SOURCE,
  modelCacheKey,
  modelCacheName,
  modelDownloadsEnabled,
  type ModelDownloadState,
  type ModelManifest,
  type ModelManifestFile,
} from '../shared/local-ai-model-download';
import { debugError, debugLog } from '../shared/debug-log';

const PROGRESS_WRITE_INTERVAL_MS = 500;

export interface ModelDownloaderDeps {
  fetch: typeof fetch;
  caches: CacheStorage;
  extensionVersion: () => string;
  onProgress?: (state: ModelDownloadState) => void;
}

function defaultDeps(): ModelDownloaderDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    caches: globalThis.caches,
    extensionVersion: () => chrome.runtime.getManifest().version,
  };
}

let inFlight: Promise<ModelDownloadState> | null = null;

async function saveState(state: ModelDownloadState): Promise<ModelDownloadState> {
  const next = { ...state, updatedAt: Date.now() };
  await chrome.storage.local.set({ [MODEL_DOWNLOAD_STATE_KEY]: next });
  return next;
}

export function parseModelManifest(value: unknown): ModelManifest {
  const manifest = value as Partial<ModelManifest> | null;
  if (
    !manifest
    || manifest.format !== 1
    || typeof manifest.version !== 'string'
    || !/^[\w.-]+$/.test(manifest.version)
    || !Array.isArray(manifest.files)
    || manifest.files.length === 0
    || !manifest.files.every((file) =>
      typeof file?.path === 'string'
      && /^[\w.-]+(\/[\w.-]+)*$/.test(file.path)
      && !file.path.split('/').includes('..')
      && Number.isSafeInteger(file.size) && file.size >= 0
      && /^[0-9a-f]{64}$/.test(file.sha256))
  ) {
    throw new Error(`${MODEL_MANIFEST_FILE} is not a valid model manifest.`);
  }
  return manifest as ModelManifest;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hasCompleteCache(deps: ModelDownloaderDeps, version: string): Promise<boolean> {
  if (!(await deps.caches.has(modelCacheName(version)))) return false;
  const cache = await deps.caches.open(modelCacheName(version));
  return Boolean(await cache.match(modelCompleteMarkerUrl()));
}

/** True when a verified model is in the cache (always true where nothing is downloaded). */
export async function isLocalAiModelReady(deps: ModelDownloaderDeps = defaultDeps()): Promise<boolean> {
  if (!modelDownloadsEnabled()) return true;
  const { readyVersion } = await loadModelDownloadState();
  return Boolean(readyVersion) && hasCompleteCache(deps, readyVersion!);
}

async function downloadFile(
  deps: ModelDownloaderDeps,
  file: ModelManifestFile,
  onBytes: (bytes: number) => void,
): Promise<Blob> {
  const response = await deps.fetch(huggingFaceFileUrl(file.path), { cache: 'no-store' });
  if (!response.ok || !response.body) {
    throw new Error(`${file.path}: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (received > file.size) throw new Error(`${file.path}: larger than the expected ${file.size} bytes`);
    onBytes(value.byteLength);
  }
  if (received !== file.size) throw new Error(`${file.path}: got ${received} bytes, expected ${file.size}`);
  return new Blob(chunks as BlobPart[]);
}

async function downloadVersion(
  deps: ModelDownloaderDeps,
  manifest: ModelManifest,
  state: ModelDownloadState,
): Promise<ModelDownloadState> {
  const totalBytes = manifestBytes(manifest);
  let current = await saveState({
    ...state,
    phase: 'downloading',
    targetVersion: manifest.version,
    receivedBytes: 0,
    totalBytes,
    error: undefined,
  });
  deps.onProgress?.(current);

  const cacheName = modelCacheName(manifest.version);
  await deps.caches.delete(cacheName); // drop a half-finished earlier attempt
  const cache = await deps.caches.open(cacheName);

  let receivedBytes = 0;
  let lastWrite = 0;
  for (const file of manifest.files) {
    const blob = await downloadFile(deps, file, (bytes) => {
      receivedBytes += bytes;
      const now = Date.now();
      if (now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) return;
      lastWrite = now;
      // Also keeps Firefox's event page awake: extension API calls reset its
      // idle timer while a long download is running.
      current = { ...current, receivedBytes };
      void saveState(current);
      deps.onProgress?.(current);
    });

    current = await saveState({ ...current, phase: 'verifying', receivedBytes });
    deps.onProgress?.(current);
    const actual = await sha256Hex(await blob.arrayBuffer());
    if (actual !== file.sha256) {
      throw new Error(`${file.path}: SHA-256 mismatch (downloaded file is not the published model)`);
    }
    await cache.put(
      modelCacheKey(file.path),
      new Response(blob, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size) },
      }),
    );
    current = await saveState({ ...current, phase: 'downloading' });
  }

  // Last: marks the version complete (see modelCompleteMarkerUrl).
  await cache.put(
    modelCompleteMarkerUrl(),
    new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }),
  );
  return current;
}

async function removeOtherVersions(deps: ModelDownloaderDeps, keepVersion: string): Promise<void> {
  for (const name of await deps.caches.keys()) {
    if (isModelCacheName(name) && name !== modelCacheName(keepVersion)) {
      await deps.caches.delete(name);
    }
  }
}

function manifestBytes(manifest: ModelManifest): number {
  return manifest.files.reduce((sum, file) => sum + file.size, 0);
}

/** The size of a complete cached version, from the manifest stored as its marker. */
async function cachedVersionBytes(deps: ModelDownloaderDeps, version: string): Promise<number | undefined> {
  const marker = await (await deps.caches.open(modelCacheName(version))).match(modelCompleteMarkerUrl());
  try {
    return marker ? manifestBytes(parseModelManifest(await marker.json())) : undefined;
  } catch {
    return undefined;
  }
}

async function run(deps: ModelDownloaderDeps, reason: string, checkNow: boolean): Promise<ModelDownloadState> {
  let state = await loadModelDownloadState();
  const extensionVersion = deps.extensionVersion();
  const readyInCache = state.readyVersion ? await hasCompleteCache(deps, state.readyVersion) : false;
  if (!readyInCache) state = { ...state, readyVersion: undefined, readyAt: undefined, readyBytes: undefined };
  // Models downloaded before the size was recorded.
  if (readyInCache && state.readyBytes === undefined) {
    const readyBytes = await cachedVersionBytes(deps, state.readyVersion!);
    if (readyBytes !== undefined) state = await saveState({ ...state, readyBytes });
  }

  // A ready model is checked for updates once per extension version, or when asked to.
  if (readyInCache && !checkNow && state.checkedExtensionVersion === extensionVersion) {
    return state;
  }

  debugLog('[PG:model-download] checking model', { reason, readyVersion: state.readyVersion });
  state = await saveState({ ...state, phase: 'checking', error: undefined });
  deps.onProgress?.(state);

  try {
    const response = await deps.fetch(huggingFaceFileUrl(MODEL_MANIFEST_FILE), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${MODEL_MANIFEST_FILE}: HTTP ${response.status}`);
    const manifest = parseModelManifest(await response.json());

    let readyAt = state.readyVersion === manifest.version ? state.readyAt : undefined;
    if (!(await hasCompleteCache(deps, manifest.version))) {
      state = await downloadVersion(deps, manifest, state);
      readyAt = Date.now();
    }

    state = await saveState({
      ...state,
      readyVersion: manifest.version,
      readyAt,
      readyBytes: manifestBytes(manifest),
      targetVersion: undefined,
      phase: 'idle',
      receivedBytes: 0,
      totalBytes: 0,
      error: undefined,
      checkedExtensionVersion: extensionVersion,
    });
    await removeOtherVersions(deps, manifest.version);
  } catch (err) {
    debugError('[PG:model-download] failed', err);
    state = await saveState({
      ...state,
      phase: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
  deps.onProgress?.(state);
  return state;
}

/**
 * Makes sure the model is downloaded and, once per extension version, up to
 * date. Concurrent callers share one run. No-op where the background does
 * not download it (the web page; in the IDE plugins the host does).
 */
export function ensureLocalAiModel(
  reason: string,
  deps: ModelDownloaderDeps = defaultDeps(),
  options: { checkNow?: boolean } = {},
): Promise<ModelDownloadState> {
  if (MODEL_SOURCE !== 'huggingface') return loadModelDownloadState();
  inFlight ??= run(deps, reason, options.checkNow === true).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Removes the downloaded model to free its space; detection is pattern-only
 * until it is downloaded again. Waits for a running download to end first.
 */
export async function deleteLocalAiModel(deps: ModelDownloaderDeps = defaultDeps()): Promise<ModelDownloadState> {
  if (MODEL_SOURCE !== 'huggingface') return loadModelDownloadState();
  await inFlight?.catch(() => undefined);
  for (const name of await deps.caches.keys()) {
    if (isModelCacheName(name)) await deps.caches.delete(name);
  }
  const state = await saveState({ ...INITIAL_MODEL_DOWNLOAD_STATE });
  deps.onProgress?.(state);
  return state;
}
