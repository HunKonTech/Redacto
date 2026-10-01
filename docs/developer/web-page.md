# Web Page (GitHub Pages)

The side panel's **Anonymize** and **History & restore** tabs are also
published as a static web page on GitHub Pages. It works like the side panel:
paste text, anonymize it, copy it to an AI chat, then paste the reply into
*History & restore* to get the original values back.

The page has a third tab, **Settings**, since it has no options page: Local AI
detection, debug logging, code blocks (secrets, *Rename code identifiers*),
sensitivity, allowlist, blocklist and the identity vault. It reuses the options
page's cards (`src/sidepanel/components/SettingsTab.svelte`) and saves to
`localStorage` like the rest. With *Rename code identifiers* on, the Anonymize
tab shows whether the identifier-classifier model decided the renames
(*Identifier classifier: AI model*) or the built-in library-name list did
(*regex fallback*, when the model is not in the build).

Everything runs in the visitor's browser. Nothing is uploaded or stored on a
server:

- Detection runs in the page: the WASM rules plus the local AI model, both
  downloaded from the Pages site itself (`wasm/`, `vendor/`, `models/`).
- History, the identity vault and settings are kept in the browser:
  `chrome.storage.local` → `localStorage`, `chrome.storage.session` →
  `sessionStorage`, keys prefixed `privacy-guardrail:`. *Clear history* in
  the page, or clearing the site's data in the browser, removes them.
- The page's Content-Security-Policy (`src/web/web.html`) only allows
  requests to its own origin, so no request can carry the text elsewhere.

Below the panel, an *Also available as* section links the browser extension
(GitHub Releases, until the Chrome Web Store listing is live) and the IDE
plugins on the VS Code, JetBrains and Visual Studio marketplaces (see
[ide-plugins.md](ide-plugins.md#publishing)).

## Offline use (PWA)

The page is an installable Progressive Web App (`src/web/manifest.webmanifest`)
and keeps working without a network, through a service worker (`src/web/sw.js`,
registered by `src/web/offline.ts`):

- On install it caches the app itself: HTML, JS, CSS, fonts, the rules WASM
  and ONNX Runtime (~40 MB). From then on the page opens and anonymizes /
  restores offline, with rule-based detection.
- The local AI model is large, so it is cached the first time detection loads
  it, or all at once with *Save the local AI model for offline use* in the page
  footer (which also asks the browser to keep the storage persistent).
- **Settings → Local AI model** shows the offline copy: the page version it
  belongs to, when the cache last got a model file, and the space it takes
  (from the file sizes the build writes into `sw.js`). *Save for offline use*
  caches the missing files; *Update from this site* drops the copy and
  downloads every file again from this site with `cache: 'reload'` (bypassing
  the browser's HTTP cache) and checks for a newer `sw.js`; *Delete model*
  removes the copy. The model always comes from this site, never from Hugging
  Face. The worker runs one such task at a time and reports progress to every
  open tab (`src/web/offline-model.ts`).
- The build (`webpack.web.config.js`) writes the file list and a hash of the
  files into `sw.js`; a new deploy installs new caches and removes the old
  ones. App and model are cached separately, so an app update does not
  re-download an unchanged model.

### Updates and version

Every deploy (each run of the Actions workflow) ships a new `sw.js`. The page
checks for it when it opens, when it returns to the foreground and every 30
minutes; the new version takes over at once and the page reloads onto it —
immediately if nothing is typed in, otherwise via *New version available —
reload* in the footer, so unsaved text is not lost.

The footer shows the version the page runs and its commit, e.g.
`v0.5.0.42 · 1a2b3c4`: the build version of the run (see
[releasing.md](releasing.md#build-versions-of-this-fork)); local builds show
`package.json`'s version.

Only the site's own files go through the service worker; it never sees the
text typed into the page.

## How it fits together

It is the IDE panel (see [ide-plugins.md](ide-plugins.md)) with the browser as
the host:

- `src/web/web-app.ts` installs the `chrome.*` shim (`src/ide/chrome-shim.ts`)
  and mounts the side panel (`src/sidepanel/App.svelte`). `runtime.sendMessage`
  runs detection in the page through `src/ide/runtime-router.ts`.
- `src/web/browser-storage.ts` seeds the shim from Web Storage and writes its
  changes back.
- `webpack.web.config.js` reuses `webpack.ide.config.js` (relative asset URLs,
  so the page works under `https://<owner>.github.io/<repo>/`) with its own
  entry and HTML, plus the manifest, icons (`src/web/icons/`) and `sw.js`;
  output is `dist-web/`.

GitHub Pages cannot send COOP/COEP headers, so ONNX Runtime runs single-threaded
(as it already does in the extension) and WebGPU is used where the browser offers it.

## Build

```bash
npm run build:wasm
npm run build:web          # dist-web/ (NER_MODEL_ASSETS_REQUIRED=1 to require the model)
```

Without the prepared model the page falls back to rule-based detection. To try
it locally, serve `dist-web/` over HTTP, e.g. `npx http-server dist-web`.

## Deploy

`.github/workflows/build-and-release.yml` builds `dist-web/` with the model in
`prepare-models-and-package`, uploads it with `actions/upload-pages-artifact`,
and the `github-pages` job publishes it with `actions/deploy-pages` (on `v*`
tags and manual runs).

One-time repository setup: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. If the `github-pages` environment restricts deployment
branches, allow the `v*` tags there as well.
