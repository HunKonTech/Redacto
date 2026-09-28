# Web Page (GitHub Pages)

The side panel's **Anonymize** and **History & restore** tabs are also
published as a static web page on GitHub Pages. It works like the side panel:
paste text, anonymize it, copy it to an AI chat, then paste the reply into
*History & restore* to get the original values back.

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
  entry and HTML; output is `dist-web/`.

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
