# Firefox build

Firefox runs the same sources as the Chrome build. What differs is small and kept out of the feature code:

| Chrome | Firefox | Where |
| --- | --- | --- |
| `background.service_worker` | `background.scripts` (event page, same bundle) | `scripts/firefox/firefox-manifest.js` |
| `chrome.offscreen` document | the same `offscreen.html` in a hidden iframe of the event page | `src/background/offscreen-host.ts` |
| `side_panel` + `chrome.sidePanel.open` | `sidebar_action` + `sidebarAction.open` | `scripts/firefox/firefox-manifest.js`, `src/shared/side-panel.ts` |
| `options_page` | `options_ui` | `scripts/firefox/firefox-manifest.js` |
| — | `browser_specific_settings.gecko` (add-on ID `redacto@hunkontech.github.io`, Firefox 140+, no data collection) | `scripts/firefox/firefox-manifest.js` |
| Local AI model packaged | Local AI model downloaded from Hugging Face on first use | `src/background/local-ai-model-downloader.ts`, `src/shared/local-ai-model-download.ts` |

`manifest.json` stays the single manifest source: webpack rewrites it for Firefox when built with `BROWSER=firefox` (`npm run build:ext:firefox`) and writes the output to `dist-firefox/`.

## Local AI model download

addons.mozilla.org rejects packages over 200 MB, and the Local AI model alone is larger than that. So the Firefox package leaves the model out (about 40 MB instead of about 230 MB) and downloads it:

- **Source:** the Hugging Face repository `koncsik/redacto-eu-pii-ner-q4f16` (build env `MODEL_HF_REPO`), at the revision the build pins (`MODEL_REVISION`, a commit SHA in CI; `main` otherwise). It holds the same files the Chrome package ships plus `redacto-model.json`, which lists every file with its size and SHA-256 and a model version derived from them.
- **When:** right after install, and whenever Local AI is needed while the model is missing (for example after an interrupted download, or when Local AI is switched back on). After every add-on update the add-on reads `redacto-model.json` again and downloads the model if its version changed; the old model stays in use until the new one is complete. With Local AI switched off nothing is downloaded.
- **Verification and storage:** each file must match its size and SHA-256 before it is stored in the add-on's Cache Storage, under the same `moz-extension://…/models/ner/…` URLs a packaged model would have. The model loader reads those URLs through `modelAwareFetch`, so the loading code is shared with Chrome.
- **Progress:** the popup shows a progress bar and the downloaded MB under its header (with **Try again** after a failure), and the toolbar icon's badge shows the percentage. Until the model is ready, detection runs pattern-only and Local AI reports "loading", so it is not switched off by the load-failure handling.

The release workflow uploads the model: step **Publish Local AI model to Hugging Face** stages it with `scripts/firefox/stage-hf-model.js` and uploads it with `scripts/firefox/upload-hf-model.py`. An unchanged model makes no new commit. It needs:

- repository secret `HF_TOKEN`: a Hugging Face access token with **write** access to the model repository (huggingface.co → Settings → Access Tokens). The repository is created (public) on the first upload; it must stay public, since the add-on downloads without a token, and the upload step fails if it is private.
- optional repository variable `MODEL_HF_REPO` to use a different repository.

Without `HF_TOKEN` the step only warns, uploads nothing, and the Firefox build follows the repository's `main` branch.

Uploading by hand (after preparing the model):

```bash
node scripts/firefox/stage-hf-model.js --out release/hf-model
HF_TOKEN=hf_... uv run --no-project --with huggingface_hub python scripts/firefox/upload-hf-model.py release/hf-model koncsik/redacto-eu-pii-ner-q4f16
```

## Build

Prerequisites are the same as for Chrome and Edge (see `scripts/edge/README.md`: Node.js 20+, Rust with the wasm target, `wasm-bindgen-cli` 0.2.118). The Local AI model is not needed to build.

```bash
npm run build:wasm
npm run package:firefox
MODEL_REVISION=<commit sha> npm run package:firefox   # pin the model revision
```

Output:

- `release/firefox/redacto-firefox-<version>/` — unpacked
- `release/firefox/redacto-firefox-<version>.zip` — upload for addons.mozilla.org, attached to every GitHub release
- `release/firefox/redacto-firefox-<version>.sha256`

Check the package against the addons.mozilla.org (AMO) rules:

```bash
npx web-ext lint --source-dir dist-firefox
```

The CI workflow (`.github/workflows/build-and-release.yml`) builds, lints and attaches the Firefox package to each GitHub release. It does not submit anything to AMO.

## Try it locally

Release Firefox only installs add-ons signed by Mozilla. Until the add-on is signed:

- **Temporary (any Firefox):** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `manifest.json` in the unpacked folder (or the zip). It is removed when Firefox restarts.
- **Permanent (Developer Edition, Nightly, ESR only):** set `xpinstall.signatures.required` to `false` in `about:config`, then `about:addons` → gear → **Install Add-on From File…** → the zip.

## Publish on addons.mozilla.org (manual, for now)

1. **Account.** Sign in at <https://addons.mozilla.org/developers/> with a Mozilla account and turn on two-factor authentication (required for submitting).
2. **Size.** AMO rejects uploads over 200 MB. The Firefox package does not contain the Local AI model (it downloads it, see above), so it is well under the limit.
3. **Submit.** Developer Hub → **Submit a New Add-on** → choose where it is distributed:
   - **On this site** — listed on AMO, reviewed, installable by everyone. This is the normal choice.
   - **On your own** — AMO only signs it (unlisted); you host the signed `.xpi` yourself, e.g. on the GitHub release. Use this to ship signed builds before the listing is ready.
4. **Upload** `redacto-firefox-<version>.zip`. AMO runs the same linter as `web-ext lint`; errors block the upload, warnings are for the reviewer.
5. **Source code.** The package contains webpack bundles and a Rust→WASM binary, so AMO asks for the source. Upload a source archive of the tagged commit (`git archive --format=zip -o redacto-source-<version>.zip v<version>`) and put the build steps in the reviewer notes:
   - Ubuntu 24.04, Node.js 20, Rust stable with `wasm32-unknown-unknown`, `wasm-bindgen-cli` 0.2.118
   - `npm ci`, `npm run build:wasm`, `MODEL_REVISION=<sha> npm run package:firefox` (the SHA from the release's workflow log)
   - ONNX Runtime Web (`vendor/onnxruntime-web/`), the identifier-classifier model and fonts are third-party libraries/data, listed in `THIRD_PARTY_NOTICES.md`.
   - Mention in the notes that the add-on downloads the Local AI model (data only, no code) from `huggingface.co`, verifies it against SHA-256 hashes, and sends no user data (see `PRIVACY.md`).
6. **Listing.** Reuse the Chrome Web Store texts and images: `docs/release/chrome-web-store-listing.md`, `docs/assets/chrome-web-store/`. License: Apache-2.0. Privacy policy: the contents of `PRIVACY.md`. Categories: Privacy & Security.
7. **Data collection.** The manifest declares `data_collection_permissions: { required: ["none"] }`; AMO shows it on the listing, nothing else to fill in.
8. **Review.** Automatic signing is usually quick; a listed add-on also gets a human review that can take days. Answer reviewer questions in the Developer Hub.
9. **Updates.** Raise the version (`npm run version:set`), rebuild, and upload a new version to the same add-on. The add-on ID must never change, or AMO treats it as a different add-on.

Automating this later is possible with `web-ext sign --channel listed` and AMO API keys (Developer Hub → Tools → Manage API Keys), stored as repository secrets like the Edge job's.
