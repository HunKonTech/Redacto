# IDE Plugins (VS Code, JetBrains, Visual Studio)

The side panel's **Anonymize** and **History & restore** tabs are also
available inside IDEs. Select code in an editor, or text in a console /
terminal / Output window, right-click → **Anonymize with Redacto**.
The panel shows the original next to the anonymized text and saves it to
History, where an AI reply can be restored to the original values. The
selection itself is never changed.

The CI workflow attaches the plugins to the GitHub pre-release and publishes
them to the VS Code Marketplace, the JetBrains Marketplace and the Visual
Studio Marketplace (see [Publishing](#publishing)).

## How it fits together

All three IDEs embed Chromium (VS Code webview, JetBrains JCEF, Visual Studio
WebView2), so they run one shared page, `dist-ide/webview/`:

- `src/ide/ide-webview.ts` mounts the existing side panel (`src/sidepanel/App.svelte`).
- `src/ide/chrome-shim.ts` provides the `chrome.*` APIs the panel and the
  detection pipeline use: storage is written through to the IDE host, and
  `runtime.sendMessage` runs detection in the page through
  `src/offscreen/offscreen-handler.ts` (WASM rules + the local AI model).
- `src/ide/host-bridge.ts` and `src/ide/protocol.ts` define the messages the
  page exchanges with the host (`ready`/`init`, `anonymize`, `storage.*`, `copy`,
  and `model.download` / `model` for the Local AI model download, `src/ide/host-model.ts`).

- `src/ide/ide-theme.ts` and `src/ide/theme/` give the panel each IDE's look
  (only in the IDE build; the extension and the web page keep their design).
  `<html data-ide-host>` selects `vscode.css`, `visualstudio.css` or
  `jetbrains.css` on top of `ide-base.css`, which maps the panel's tokens to
  `--ide-*` variables. VS Code webviews already carry the theme as
  `--vscode-*` variables; Visual Studio (`PanelTheme.cs`, from `VSColorTheme`)
  and JetBrains (`PanelTheme.kt`, from `UIManager`) send their colors and fonts
  in `init` and again as a `theme` message when the IDE theme changes.

The hosts are thin:

| IDE | Folder | Panel | Context menus | Storage (`local`) |
| --- | --- | --- | --- | --- |
| VS Code | `ide/vscode` | Activity Bar view | editor, Output, terminal (+ "Anonymize clipboard" command) | `globalState` |
| JetBrains | `ide/jetbrains` | "Redacto" tool window (JCEF, served as `https://pg.local/`) | editor, Run/Debug console (+ Tools → Anonymize Clipboard) | `<config>/privacy-guardrail/storage.json` |
| Visual Studio 2022 | `ide/visualstudio` | tool window (WebView2, `https://pg.local/`) | code editor, Output window | `%LOCALAPPDATA%\PrivacyGuardrail\storage.json` |

`session` storage lives in memory for as long as the IDE runs, like
`chrome.storage.session`. The panel has a **Settings** tab (the web page's:
local AI, code blocks, sensitivity, allow/blocklist, identity vault). Settings
use the browser defaults, except that **Rename code identifiers** is on
(`src/ide/ide-defaults.ts`), since IDE selections are mostly code.

## Build

The plugins do not contain the Local AI model: the host downloads it from
Hugging Face when the panel first opens, shows the progress in the IDE and in
the panel, and serves it to the panel from its data folder (see
[model-download.md](model-download.md)). Until then, detection is rule-based.
The model is not needed to build.

```bash
npm run build:wasm
npm run build:ide-webview           # dist-ide/webview (no model; model-source.json says where it is downloaded from)
npm run build:ide:vscode            # release/ide/redacto-vscode-<version>.vsix
npm run build:ide:jetbrains         # release/ide/redacto-jetbrains-<version>.zip  (JDK 21)
npm run build:ide:visualstudio      # release/ide/redacto-visualstudio-<version>.vsix  (Windows, VSSDK)
```

The `build:ide:*` scripts rebuild the panel first; `scripts/ide/build-*.js`
package an existing `dist-ide/webview` only (that is what CI runs).

In CI (`.github/workflows/build-and-release.yml`) the panel is built in
`prepare-models-and-package`, pinned to the model revision uploaded to Hugging Face there, and the `vscode-extension`,
`jetbrains-plugin` and `visualstudio-extension` jobs upload
`ide-redacto-*` artifacts, which `github-release` attaches to the
GitHub pre-release (a failed IDE job only leaves its installer out). The Visual Studio job needs a Windows runner with the "Visual Studio
extension development" workload.

## Publishing

Each IDE job publishes the installer it built, after uploading it as an
artifact. Publishing is skipped when the secret is missing and a failed
publish does not fail the job (the installer still reaches the pre-release).

| Marketplace | Secret | Listing |
| --- | --- | --- |
| VS Code | `VS_MARKETPLACE_PAT` | publisher `benkoncsik`, `benkoncsik.redacto-vscode` (`vsce publish`) |
| Visual Studio | `VS_MARKETPLACE_PAT` | publisher `benkoncsik`, internal name `Redacto` (`VsixPublisher.exe`, `ide/visualstudio/PrivacyGuardrail.VisualStudio/publishManifest.json`) |
| JetBrains | `JETBRAINS_MARKETPLACE_TOKEN` (optional signing: `JETBRAINS_CERTIFICATE_CHAIN`, `JETBRAINS_PRIVATE_KEY`, `JETBRAINS_PRIVATE_KEY_PASSWORD`) | plugin id `com.hunkontech.privacyguardrail` (`gradlew publishPlugin`) |

Versions: JetBrains and Visual Studio use the build version (`0.5.0.17`);
VS Code has no fourth part, so it gets `0.5.17` (the run number as patch).

The JetBrains Marketplace only accepts updates for an existing plugin: upload
the first `redacto-jetbrains-*.zip` by hand at
<https://plugins.jetbrains.com/plugin/add> and wait for approval; until then
the publish step warns "Cannot find plugin".

## Install

- **VS Code**: Extensions view → `…` → *Install from VSIX…*, or
  `code --install-extension redacto-vscode-<version>.vsix`.
- **JetBrains IDEs** (2024.2+): Settings → Plugins → ⚙ → *Install Plugin from Disk…* → the `.zip`.
- **Visual Studio 2022**: double-click the `.vsix` (VSIXInstaller). Open the
  panel from View → Other Windows → Redacto.
