# Chrome Web Store Listing Copy

Upload-ready copy and permission justifications for Redacto `0.5.0`. This document mirrors the live Chrome Web Store listing. The Chrome Web Store upload itself remains manual — this document only prepares the text and asset references the operator pastes into the Developer Dashboard.

## Item Name

```
Redacto
```

## Short Description (≤132 characters)

```
Local review of personal data in your text before pasting into ChatGPT, Claude, or Gemini. No uploads, no telemetry.
```

## Category

```
Productivity
```

## Detailed Description

```
Redacto — catch personal data before it reaches the AI

Redacto helps you spot personal or sensitive data in text before you paste it into a supported AI chat assistant. All detection runs locally in your browser. Nothing you type, paste, review, or correct is uploaded to any server by this extension, and there is no telemetry or analytics.

Redacto is an independent, non-commercial fork of Privacy Guardrail, which was developed at the German Research Center for Artificial Intelligence (DFKI). Redacto is not affiliated with or endorsed by DFKI.

This is a public beta.

Detection is assistive: it helps you catch things, but it will not catch everything and it is not a compliance or data-loss-prevention product.


WHAT’S NEW IN 0.5.0

• Fixed a bug introduced by ChatGPT's newer desktop layout
• Better resilience against HTML changes of the supported chat assistants. Pastes are now reviewed even when Redacto no longer recognizes a site's message box, by using the box you pasted into. The popup tells you when it is working this way, and the on-page warning is now reserved for pastes that were not reviewed at all.
• Redacto now recognizes a chat by what is on the page instead of by its web address
• Your original values are no longer stored against a conversation; they live only in the identity vault. With cross-session memory switched off, nothing is written to durable storage at all.
• Fixed a bug that sometimes marked the wrong texts as sensitive
• Conversations recorded by earlier versions keep working. Nothing is migrated, rewritten, or deleted


WHAT IT DOES

• Intercepts pastes on supported chat sites and offers a local review step.
• Highlights potentially personal or sensitive spans such as names, emails, phone numbers, addresses, IBANs, credit card numbers, IP addresses, organizations, and locations.
• Lets you accept or ignore each detected span and inserts typed placeholders for the spans you accept.
• Keeps a local identity vault so the same value gets the same placeholder across a conversation, and supports restoration where the chat surface allows it. Restored values are highlighted in the AI response, and restoration never writes into the message box or any other field you can type in.
• Combines fast pattern recognizers with an optional local AI model that runs entirely in your browser through ONNX Runtime Web, using WebGPU when available and CPU/WASM otherwise.
• Falls back to a clearly degraded pattern-only mode when local AI is unavailable, instead of silently pasting unchecked text.
• Keeps reviewing pastes when a chat site changes enough that Redacto no longer recognizes its message box, and warns you on the page when a paste was not reviewed.


SUPPORTED CHAT APPS

• ChatGPT (chat.openai.com, chatgpt.com)
• Claude (claude.ai)
• Gemini (gemini.google.com)

Generic or custom websites are not supported.


PRIVACY POSTURE

• No telemetry. No analytics. No automatic remote feedback collection.
• No upload of clipboard text, prompts, responses, detected entities, identity maps, vault data, or feedback logs.
• No clipboard permissions. The extension sees clipboard text only in the paste or copy you make on a supported chat site, and cannot read your clipboard in the background or on other websites.
• Your original values are stored only in the identity vault, which you can inspect and edit in the options page. What is recorded against a conversation is the placeholders it used, never the originals.
• With cross-session memory switched off, no original values are written to durable storage at all; restoration lasts only as long as the browser session.
• The local AI model and runtime are packaged with the extension; there is no remote model fetch.
• Settings, identity vault, allow/block lists, and local feedback logs are stored only in Chrome extension storage on your device.
• Full details in the project's Privacy Policy: https://github.com/HunKonTech/Redacto/blob/main/PRIVACY.md


SYSTEM REQUIREMENTS

Redacto runs a transformer NER model directly in your browser, which is demanding. Please review these requirements before installing:

• Browser: Google Chrome desktop, latest stable version. Other Chromium browsers and mobile Chrome are not supported in this release.
• Recommended for Local AI: at least 16 GB of system RAM and a WebGPU-capable GPU for smooth, responsive detection.
• Minimum for Local AI: more than 2 GB of browser-reported memory. On systems with 2 GB or less, Local AI auto-disables and the extension falls back to pattern-only detection. Between 2 GB and 4 GB, Local AI stays on but a slowdown warning may appear.
• Without WebGPU: Local AI falls back to CPU/WASM execution — functional but noticeably slower.
• The default Local AI model is a compact q4f16 build that typically keeps the loaded extension runtime around 1 GB of RAM in local validation.
• Pattern-only mode (regex/checksum detection without the transformer) runs on any supported Chrome system, regardless of memory or GPU.

These requirements exist because the AI model runs locally on your device instead of in the cloud. Further lowering resource use through smaller models, distillation, and more efficient inference is an active area of work.


KNOWN LIMITATIONS — PLEASE READ

Redacto is an assistive tool, not a compliance or data loss prevention (DLP) product. It is currently in public beta (version 0.5.0).

• Detection can miss sensitive content (false negatives) and can flag harmless text (false positives). Always review the suggestions before sending.
• Short names, ambiguous words, code blocks, tables, and unusual formatting reduce detection quality.
• Local AI performance depends on your browser, device memory, and WebGPU support. Pattern-only mode covers a narrower set of categories than Local AI.
• Restoration of placeholders in model responses depends on local records and may not handle every rewrite the model produces. Placeholders the model has altered, for example by changing capitalization or dropping brackets, are not offered for restoration.
• The extension does not protect text you type directly into the chat input — it triggers on paste events.
• Detection quality varies by language; English and major European languages are the primary focus during the beta. Local AI's vocabulary covers Latin, Greek, and Cyrillic script only, so names and addresses written in other scripts, for example Chinese, Japanese, or Arabic, are less likely to be flagged. Pattern detection is unaffected.

If accidentally sharing personal data with an AI service would have serious legal, financial, or safety consequences for you, please do not rely on this extension as your sole safeguard.


OPEN SOURCE AND TRANSPARENT

Redacto is open source. You can inspect the code, build it yourself, and verify the SHA-256 checksum of each release against the ZIP attached to the corresponding GitHub Release. Contributions, bug reports, and feedback are welcome through the project's GitHub repository.


ABOUT THE PROJECT

Redacto is maintained by Benedek Koncsik as a free, non-commercial open-source project. It builds on Privacy Guardrail by DFKI (Apache-2.0) and adds side-panel anonymization, source-code secret detection, identifier renaming, web search protection and IDE plugins.


PROVIDER & LEGAL NOTICE

Published by Benedek Koncsik (private individual, non-commercial).

• Impressum / Legal Notice (§ 5 DDG): https://github.com/HunKonTech/Redacto/blob/main/IMPRESSUM.md
• Privacy Policy: https://github.com/HunKonTech/Redacto/blob/main/PRIVACY.md
• Terms of Use: https://github.com/HunKonTech/Redacto/blob/main/TERMS.md
• Source code & releases: https://github.com/HunKonTech/Redacto
```

## Single Purpose Statement

```
Provide local, in-browser review of personal or sensitive data in text before it is pasted into supported large-language-model chat sites (ChatGPT, Claude, Gemini), without sending any text off-device.
```

## Permission Justifications

These match the manifest after the permission audit (`docs/release/chrome-permissions.md`). Paste each justification into the corresponding Developer Dashboard field.

### `storage`

```
Stores user settings, the local identity vault used to keep the same placeholder for the same value across a conversation, allow/block lists, local feedback logs, and local system compatibility state in Chrome extension storage. No data leaves the device.
```

### `offscreen`

```
Runs the local PII detection model in an offscreen extension document. Manifest V3 service workers cannot host the long-lived WebAssembly/ONNX runtime needed for in-browser inference, so an offscreen document is required to keep all detection on-device.
```

### `tabs`

```
Used for visible extension workflows: opening Privacy/Support/Security and Options pages from the popup, broadcasting settings changes to open supported chat tabs so review behavior stays consistent, and updating the toolbar icon to reflect whether the current tab is a supported site.
```

### Host permission justification (one combined entry)

```
The extension only acts on four supported chat sites: chatgpt.com, chat.openai.com, claude.ai, and gemini.google.com. Host access is required to inject the paste-interception content script, the local review banner, and to expose packaged WebAssembly/ONNX runtime and model assets to those pages so detection can run locally. No other websites are matched, and no broad <all_urls> access is requested.
```

### Remote code use

```
None. The extension does not load remote code. The local AI model and ONNX Runtime Web assets are packaged inside the extension. Content Security Policy is "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'".
```

## Privacy Practices Disclosures

For the Developer Dashboard "Privacy practices" section.

- Personally identifiable information: **Not collected.** All detection runs locally; no user content is transmitted by the extension.
- Health information: **Not collected.**
- Financial and payment information: **Not collected.** Card numbers and IBANs may be detected locally, but are never transmitted by the extension.
- Authentication information: **Not collected.** Detected passwords or tokens are flagged locally only.
- Personal communications: **Not collected.** Pasted prompt text is processed locally and not transmitted.
- Location: **Not collected.**
- Web history: **Not collected.**
- User activity: **Not collected.**
- Website content: **Not collected.** The extension reads paste events on supported sites only for local review and never transmits the content.

Certify all three required statements:

- I do not sell or transfer user data to third parties outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Support And Privacy Links

| Field | URL |
|---|---|
| Homepage URL | `https://github.com/HunKonTech/Redacto` |
| Support URL | `https://github.com/HunKonTech/Redacto/blob/main/SUPPORT.md` |
| Privacy policy URL | `https://github.com/HunKonTech/Redacto/blob/main/PRIVACY.md` |
| Security reporting | `https://github.com/HunKonTech/Redacto/blob/main/SECURITY.md` |
| Sensitive contact | `koncsik.benedek.andras@gmail.com` |

## Screenshots And Promo Tiles

Screenshots are produced under slice 14 using the operator capture workflow in `docs/release/screenshot-script.md`, the prompts in `docs/release/synthetic-prompts.md`, and the frame list in `docs/release/screenshot-shot-list.md`. The first public beta captures on real supported sites with synthetic prompts only and strict redaction. Do not upload screenshots that show real user accounts, real prompts, real responses, real personal data, browser profile names, or internal project paths.

Required visuals before submission:

- At least three 1280×800 or 640×400 screenshots from the synthetic set.
- Optional small (440×280) and marquee (1400×560) promo tiles, only if available from the synthetic-screenshot workflow.

### Logo asset-to-slot mapping

Brand asset sources live under `docs/assets/` and are rendered by `node scripts/render-logo.mjs` from the mark in `docs/assets/redacto-logo.svg`. Do not use the Privacy Guardrail or DFKI logos: they are not licensed under Apache-2.0 (see `NOTICE`).

| Store slot | Asset(s) | Notes |
|---|---|---|
| 128×128 store icon | `src/assets/icons/icon128.png` (mark only) | the wordmark would be unreadable at this size. |
| Small promo tile (440×280) and marquee (1400×560) | `docs/assets/redacto-logo-black.png` on a light background, or `docs/assets/redacto-opengraph.png` cropped | |
| Screenshots (1280×800) | synthetic set only | |

## Pre-Submission Checklist

- [ ] `manifest.json` version equals the released `0.5.0` artifact (`npm run version:check -- 0.5.0 --require-tag`).
- [ ] Uploaded ZIP is the exact artifact built by `npm run package:release` and matches the published SHA-256 checksum.
- [ ] Listing only references the four supported sites and does not advertise generic or custom site support.
- [ ] Listing uses "review", "replace", and "restore"; it avoids legal de-identification
      terminology unless that legal meaning is intended.
- [ ] Permission justifications match the audited manifest in `docs/release/chrome-permissions.md`.
- [ ] Privacy policy and Support URLs resolve on the public GitHub repo.
- [ ] Screenshots are from the synthetic set only (slice 14).
- [ ] Sensitive-report email is `koncsik.benedek.andras@gmail.com`.
