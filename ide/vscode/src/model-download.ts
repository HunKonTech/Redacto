/**
 * Redacto — Local AI model download (VS Code host)
 *
 * The plugin does not ship the Local AI model (~190 MB); it is downloaded
 * once, on first use, from the Hugging Face repository named in the panel's
 * `model-source.json`, into the extension's global storage:
 *
 *   <globalStorage>/local-ai-model/<version>/…              the model files
 *   <globalStorage>/local-ai-model/<version>/redacto-model.json  written last: complete
 *   <globalStorage>/local-ai-model/state.json               ready version, last check
 *
 * Every file is checked against its size and SHA-256 in `redacto-model.json`.
 * A newer model is looked for once per plugin version; it is downloaded next
 * to the old one, which stays in use until the new one is complete. Only
 * model files are downloaded; no user content leaves the device.
 *
 * Same design as the other hosts (JetBrains: ModelDownload.kt, Visual Studio:
 * ModelDownload.cs) and as the browser extension; see
 * docs/developer/model-download.md in the repository root.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

/** src/ide/protocol.ts `HostModelState`, without `baseUrl` (the webview adds where it is served). */
export interface ModelState {
  phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'failed';
  readyVersion?: string;
  targetVersion?: string;
  receivedBytes: number;
  totalBytes: number;
  error?: string;
}

/** `model-source.json`, written by the panel build (scripts/hf-model/model-source.js). */
interface ModelSource {
  repo: string;
  revision: string;
  manifest: string;
}

interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
}

interface Manifest {
  format: 1;
  version: string;
  files: ManifestFile[];
}

interface StoredState {
  readyVersion?: string;
  checkedPluginVersion?: string;
}

const MANIFEST_FILE = 'redacto-model.json';
const PROGRESS_INTERVAL_MS = 250;

export function parseManifest(value: unknown): Manifest {
  const manifest = value as Partial<Manifest> | null;
  const valid =
    !!manifest &&
    manifest.format === 1 &&
    typeof manifest.version === 'string' &&
    /^[\w.-]+$/.test(manifest.version) &&
    Array.isArray(manifest.files) &&
    manifest.files.length > 0 &&
    manifest.files.every(
      (file) =>
        typeof file?.path === 'string' &&
        /^[\w.-]+(\/[\w.-]+)*$/.test(file.path) &&
        !file.path.split('/').includes('..') &&
        Number.isSafeInteger(file.size) &&
        file.size >= 0 &&
        typeof file.sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(file.sha256),
    );
  if (!valid) throw new Error('redacto-model.json is not a valid model manifest.');
  return manifest as Manifest;
}

export class ModelDownloader {
  private state: ModelState = { phase: 'idle', receivedBytes: 0, totalBytes: 0 };
  private running: Promise<void> | null = null;
  private readonly listeners: Array<(state: ModelState) => void> = [];

  constructor(
    /** The panel folder, which holds `model-source.json`. */
    private readonly webviewDir: string,
    /** `<globalStorage>/local-ai-model`. */
    readonly modelDir: string,
    private readonly pluginVersion: string,
  ) {
    const ready = this.readyVersionOnDisk();
    if (ready) this.state = { ...this.state, readyVersion: ready };
  }

  current(): ModelState {
    return this.state;
  }

  /** Folder of the ready version, if any. */
  readyDir(): string | undefined {
    return this.state.readyVersion ? path.join(this.modelDir, this.state.readyVersion) : undefined;
  }

  onState(listener: (state: ModelState) => void): void {
    this.listeners.push(listener);
  }


  /**
   * Makes sure the model is on disk and, once per plugin version, up to date.
   * Concurrent calls share one run.
   */
  ensure(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private set(next: Partial<ModelState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  private readStored(): StoredState {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.modelDir, 'state.json'), 'utf8')) as StoredState;
    } catch {
      return {};
    }
  }

  private writeStored(stored: StoredState): void {
    fs.mkdirSync(this.modelDir, { recursive: true });
    fs.writeFileSync(path.join(this.modelDir, 'state.json'), JSON.stringify(stored));
  }

  private isComplete(version: string): boolean {
    return fs.existsSync(path.join(this.modelDir, version, MANIFEST_FILE));
  }

  private readyVersionOnDisk(): string | undefined {
    const { readyVersion } = this.readStored();
    return readyVersion && this.isComplete(readyVersion) ? readyVersion : undefined;
  }

  private source(): ModelSource {
    return JSON.parse(fs.readFileSync(path.join(this.webviewDir, 'model-source.json'), 'utf8')) as ModelSource;
  }

  private async run(): Promise<void> {
    const ready = this.readyVersionOnDisk();
    this.state = { ...this.state, readyVersion: ready };
    if (ready && this.readStored().checkedPluginVersion === this.pluginVersion) {
      this.set({ phase: 'idle', error: undefined });
      return;
    }

    this.set({ phase: 'checking', error: undefined });
    try {
      const source = this.source();
      const fileUrl = (file: string) =>
        `https://huggingface.co/${source.repo}/resolve/${encodeURIComponent(source.revision)}/${file}`;
      const response = await fetch(fileUrl(source.manifest), { cache: 'no-store' });
      if (!response.ok) throw new Error(`${source.manifest}: HTTP ${response.status}`);
      const manifestText = await response.text();
      const manifest = parseManifest(JSON.parse(manifestText));

      if (!this.isComplete(manifest.version)) await this.download(manifest, manifestText, fileUrl);

      this.writeStored({ readyVersion: manifest.version, checkedPluginVersion: this.pluginVersion });
      for (const entry of fs.readdirSync(this.modelDir)) {
        if (entry !== manifest.version && entry !== 'state.json') {
          fs.rmSync(path.join(this.modelDir, entry), { recursive: true, force: true });
        }
      }
      this.set({
        phase: 'idle',
        readyVersion: manifest.version,
        targetVersion: undefined,
        receivedBytes: 0,
        totalBytes: 0,
        error: undefined,
      });
    } catch (err) {
      this.set({ phase: 'failed', error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async download(
    manifest: Manifest,
    manifestText: string,
    fileUrl: (file: string) => string,
  ): Promise<void> {
    const totalBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
    const partial = path.join(this.modelDir, `${manifest.version}.partial`);
    fs.rmSync(partial, { recursive: true, force: true });
    fs.mkdirSync(partial, { recursive: true });
    this.set({ phase: 'downloading', targetVersion: manifest.version, receivedBytes: 0, totalBytes });

    let received = 0;
    let lastReport = 0;
    for (const file of manifest.files) {
      const target = path.join(partial, ...file.path.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const response = await fetch(fileUrl(file.path), { cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error(`${file.path}: HTTP ${response.status}`);

      const hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(target);
      let fileBytes = 0;
      try {
        for await (const chunk of Readable.fromWeb(response.body as import('stream/web').ReadableStream<Uint8Array>)) {
          const bytes = chunk as Buffer;
          fileBytes += bytes.length;
          if (fileBytes > file.size) throw new Error(`${file.path}: larger than the expected ${file.size} bytes`);
          hash.update(bytes);
          if (!out.write(bytes)) await new Promise<void>((resolve) => out.once('drain', () => resolve()));
          received += bytes.length;
          const now = Date.now();
          if (now - lastReport >= PROGRESS_INTERVAL_MS) {
            lastReport = now;
            this.set({ receivedBytes: received });
          }
        }
      } finally {
        await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      }
      if (fileBytes !== file.size) throw new Error(`${file.path}: got ${fileBytes} bytes, expected ${file.size}`);
      this.set({ phase: 'verifying', receivedBytes: received });
      if (hash.digest('hex') !== file.sha256) {
        throw new Error(`${file.path}: SHA-256 mismatch (downloaded file is not the published model)`);
      }
      this.set({ phase: 'downloading' });
    }

    // Last: marks the version complete.
    fs.writeFileSync(path.join(partial, MANIFEST_FILE), manifestText);
    const finalDir = path.join(this.modelDir, manifest.version);
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.renameSync(partial, finalDir);
  }
}
