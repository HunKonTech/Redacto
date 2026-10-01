# Local AI model download

No Redacto package ships the Local AI (NER) model. The browser extensions (Chrome, Edge, Firefox) and the IDE plugins (VS Code, JetBrains, Visual Studio) download it once, on first use, from the project's Hugging Face repository. This keeps every package about 70 MB instead of about 230 MB. (Most of the rest is the identifier classifier, `models/identifier-classifier/`, 83 MB, which is still packaged; without it a package would be about 10 MB.) The size matters in practice: addons.mozilla.org rejects packages over 200 MB, and the JetBrains Marketplace upload of the 230 MB plugin took over an hour and a half in CI.

The web page (GitHub Pages) is the exception: it serves the model next to itself and its service worker caches it on first use (see [web-page.md](web-page.md)).

Only model files are downloaded. Pasted text, detected entities and anything else the user works on never leave the device (see `PRIVACY.md`).

## Where from

- **Repository:** `koncsik/redacto-eu-pii-ner-q4f16` (build env / repository variable `MODEL_HF_REPO`).
- **Revision:** the commit the build pins (`MODEL_REVISION`; a commit SHA in CI, `main` otherwise), so every release uses the model it was built and tested with.
- **Manifest:** `redacto-model.json` in the repository lists every file with its size and SHA-256, plus a model version derived from them.

The browser builds get repository and revision through webpack's `DefinePlugin` (`webpack.config.js`). The IDE panel build writes them to `dist-ide/webview/model-source.json`, which the IDE hosts read. Both use `scripts/hf-model/model-source.js`.

## How each build downloads it

All builds share the same rules. The files are downloaded and each one is checked against its size and SHA-256. A version counts as complete only once every file is verified, and a copy of the manifest, written last, marks it complete. A newer model is looked for once per extension or plugin version. It downloads next to the old one, which stays in use until the new one is complete; then the old one is removed. With Local AI switched off, nothing is downloaded.

| Build | Who downloads | Stored in | Loaded through |
| --- | --- | --- | --- |
| Chrome, Edge, Firefox | background (`src/background/local-ai-model-downloader.ts`) | the extension's Cache Storage, keyed by `https://local-ai-model.redacto.invalid/<file>` (Chrome's Cache API takes no `chrome-extension://` keys) | `modelAwareFetch` answers the model's `chrome-extension://…/models/ner/…` URLs from the complete cache; it needs no `chrome.storage`, which Chrome's offscreen document lacks |
| VS Code | extension host (`ide/vscode/src/model-download.ts`) | `<globalStorage>/local-ai-model/<version>/` | the webview loads `asWebviewUri(<version dir>)` |
| JetBrains | `ModelDownload.kt` | `<IDE system dir>/privacy-guardrail/local-ai-model/<version>/` | `PanelAssets` serves it as `https://pg.local/downloaded-model/<version>/` |
| Visual Studio | `ModelDownload.cs` | `%LOCALAPPDATA%\PrivacyGuardrail\local-ai-model\<version>\` | WebView2 maps `https://pg-model.local/` to that folder |

In the IDE panel (`src/ide/host-model.ts`) the host's progress arrives as `model` messages (`HostModelState` in `src/ide/protocol.ts`). `modelAwareFetch` redirects the model URLs to the host's `baseUrl` once a version is ready. The panel sends `model.download` when it opens with Local AI on, when Local AI is switched on, and on **Try again**.

**When the download starts:**

- Browsers: right after install, on browser start (to resume an interrupted download), and whenever Local AI is needed while the model is missing.
- IDEs: when the Redacto panel first opens.

After a failure, detection asks again at most every five minutes; **Try again** retries at once.

## Feedback

Every build shows that the model is downloading, how far along it is, and when it failed:

- **Browsers:** a progress bar with the downloaded MB under the header of the popup and of the side panel, with **Try again** after a failure. The toolbar icon's badge shows the percentage (`!` after a failed first download).
- **Browsers, options page:** the **Local AI model** card shows the ready version, when it was downloaded (`readyAt`) and the space it takes (`readyBytes`, the sum of the manifest's file sizes), and has **Download now** (works while Local AI is off), **Check for updates** (`DOWNLOAD_LOCAL_AI_MODEL` with `checkNow`, which skips the once-per-extension-version rule) and **Delete model** (`DELETE_LOCAL_AI_MODEL`: removes every model cache and closes the offscreen document; with Local AI on, the model is downloaded again when next needed). The popup's Settings tab sums this up in one row that links to the card. Models downloaded before `readyAt` was recorded show it as not recorded; their size is read back from the cached manifest.
- **IDE plugins:** the same bar in the Redacto panel, plus the IDE's own indicator:
  - VS Code: a progress notification, and a warning with **Try again** if the first download fails.
  - JetBrains: a background task with a progress bar in the status bar (cancellable), and a balloon with **Try again** if the first download fails.
  - Visual Studio: a status bar progress bar, and a status bar message if the first download fails.

Until the model is ready, detection runs pattern-based only (secrets, emails, IBANs, …). Local AI reports "loading" with the download status instead of a failure, so the load-failure handling does not switch it off.

## Publishing the model

The release workflow's step **Publish Local AI model to Hugging Face** runs before any package is built. It stages the prepared model with `scripts/hf-model/stage-hf-model.js`, uploads it with `scripts/hf-model/upload-hf-model.py`, and exports `MODEL_HF_REPO` / `MODEL_REVISION` to the job, so every build pins the uploaded commit. An unchanged model makes no new commit. It needs:

- repository secret `HF_TOKEN`: a Hugging Face access token with **write** access to the model repository (huggingface.co → Settings → Access Tokens). The repository is created (public) on the first upload. It must stay public, since Redacto downloads without a token, and the upload step fails if it is private.
- optional repository variable `MODEL_HF_REPO` to use a different repository.

Without `HF_TOKEN` the step only warns, uploads nothing, and the builds follow the repository's `main` branch.

Uploading by hand (after preparing the model, see [model-assets.md](model-assets.md)):

```bash
node scripts/hf-model/stage-hf-model.js --out release/hf-model
HF_TOKEN=hf_... uv run --no-project --with huggingface_hub python scripts/hf-model/upload-hf-model.py release/hf-model koncsik/redacto-eu-pii-ner-q4f16
```

## Packaging the model instead

For local testing without a network, `MODEL_SOURCE=bundled` builds the browser extension with the prepared model inside, as before:

```bash
MODEL_SOURCE=bundled NER_MODEL_ASSETS_REQUIRED=1 npm run build
```

The live end-to-end tests (`e2e/live/preflight.ts`) and `npm run validate:release-strict` build this way.
