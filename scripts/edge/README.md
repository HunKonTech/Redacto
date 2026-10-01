# Microsoft Edge build

Edge runs the same Manifest V3 extension as Chrome, so no code or manifest changes are needed. These scripts build the extension and stage it for Edge.

## Prerequisites

- Node.js 20+
- Rust with the WebAssembly target, and `wasm-bindgen-cli` 0.2.118:

  ```bash
  rustup target add wasm32-unknown-unknown
  cargo install wasm-bindgen-cli --version 0.2.118
  ```

## Local AI model (optional)

The package does not contain the Local AI model: the extension downloads it from Hugging Face on first use (see [`docs/developer/model-download.md`](../../docs/developer/model-download.md)), so it is not needed to build. To package it instead, for testing without a network, prepare the model once (macOS / Linux):

```bash
scripts/edge/prepare-model.sh
```

This creates a Python 3.10–3.13 environment in `.venv/`, downloads the pinned BardsAI model (about 1.3 GB) into `.model-sources/`, and writes the optimized 4-bit model to `generated/models/ner/`. All three folders are Git-ignored. Pass `--python <path>` to choose the interpreter, or `--force` to rebuild. Then build with `--require-model`.

## Build

macOS / Linux:

```bash
scripts/edge/build-edge.sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\edge\build-edge.ps1
```

Or on any platform: `npm run package:edge`.

Output in `release/edge/`:

| Path | Use |
| --- | --- |
| `redacto-edge-<version>/` | Unpacked extension for **Load unpacked** |
| `redacto-edge-<version>.zip` | Upload to Edge Add-ons (Partner Center) |
| `redacto-edge-<version>.sha256` | Checksum of the zip |

Options:

- `--skip-build` — repackage the existing `dist/` without rebuilding.
- `--require-model` — package the prepared Local AI model instead of downloading it on first use, and fail unless it is prepared (see [`docs/developer/model-assets.md`](../../docs/developer/model-assets.md)).

## Install in Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode** (left sidebar).
3. Click **Load unpacked** and select `release/edge/redacto-edge-<version>/`.
4. Pin the extension from the puzzle-piece menu, then open ChatGPT, Claude or Gemini.

After rebuilding, click **Reload** on the extension card. Edge does not install `.zip` or `.crx` files from outside its store; the zip is only for publishing through Partner Center.
