# IDE Plugins (VS Code, JetBrains, Visual Studio)

The side panel's **Anonymize** and **History & restore** tabs are also
available inside IDEs. Select code in an editor, or text in a console /
terminal / Output window, right-click → **Anonymize with Privacy Guardrail**.
The panel shows the original next to the anonymized text and saves it to
History, where an AI reply can be restored to the original values. The
selection itself is never changed.

These plugins are built for **manual installation only**. They are never
published to the VS Code Marketplace, JetBrains Marketplace or Visual Studio
Marketplace, and the CI workflow only uploads them as workflow artifacts.

## How it fits together

All three IDEs embed Chromium (VS Code webview, JetBrains JCEF, Visual Studio
WebView2), so they run one shared page, `dist-ide/webview/`:

- `src/ide/ide-webview.ts` mounts the existing side panel (`src/sidepanel/App.svelte`).
- `src/ide/chrome-shim.ts` provides the `chrome.*` APIs the panel and the
  detection pipeline use: storage is written through to the IDE host, and
  `runtime.sendMessage` runs detection in the page through
  `src/offscreen/offscreen-handler.ts` (WASM rules + the local AI model).
- `src/ide/host-bridge.ts` and `src/ide/protocol.ts` define the messages the
  page exchanges with the host (`ready`/`init`, `anonymize`, `storage.*`, `copy`).

The hosts are thin:

| IDE | Folder | Panel | Context menus | Storage (`local`) |
| --- | --- | --- | --- | --- |
| VS Code | `ide/vscode` | Activity Bar view | editor, Output, terminal (+ "Anonymize clipboard" command) | `globalState` |
| JetBrains | `ide/jetbrains` | "Privacy Guardrail" tool window (JCEF, served as `https://pg.local/`) | editor, Run/Debug console (+ Tools → Anonymize Clipboard) | `<config>/privacy-guardrail/storage.json` |
| Visual Studio 2022 | `ide/visualstudio` | tool window (WebView2, `https://pg.local/`) | code editor, Output window | `%LOCALAPPDATA%\PrivacyGuardrail\storage.json` |

`session` storage lives in memory for as long as the IDE runs, like
`chrome.storage.session`. Settings use their defaults (local AI on, identity
vault on); there is no options page in the IDEs.

## Build

Prepare the model first if the plugins should include the local AI (see
[building.md](building.md#full-model-build)); without it they fall back to
rule-based detection.

```bash
npm run build:wasm
npm run build:ide-webview           # dist-ide/webview (NER_MODEL_ASSETS_REQUIRED=1 to require the model)
npm run build:ide:vscode            # release/ide/privacy-guardrail-vscode-<version>.vsix
npm run build:ide:jetbrains         # release/ide/privacy-guardrail-jetbrains-<version>.zip  (JDK 21)
npm run build:ide:visualstudio      # release/ide/privacy-guardrail-visualstudio-<version>.vsix  (Windows, VSSDK)
```

The `build:ide:*` scripts rebuild the panel first; `scripts/ide/build-*.js`
package an existing `dist-ide/webview` only (that is what CI runs).

In CI (`.github/workflows/build-and-release.yml`) the panel is built with the
model in `prepare-models-and-package`, and the `vscode-extension`,
`jetbrains-plugin` and `visualstudio-extension` jobs upload
`ide-privacy-guardrail-*` artifacts. They are not attached to the GitHub
release. The Visual Studio job needs a Windows runner with the "Visual Studio
extension development" workload.

## Install

- **VS Code**: Extensions view → `…` → *Install from VSIX…*, or
  `code --install-extension privacy-guardrail-vscode-<version>.vsix`.
- **JetBrains IDEs** (2024.2+): Settings → Plugins → ⚙ → *Install Plugin from Disk…* → the `.zip`.
- **Visual Studio 2022**: double-click the `.vsix` (VSIXInstaller). Open the
  panel from View → Other Windows → Privacy Guardrail.
