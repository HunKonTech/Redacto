# How To Use Privacy Guardrail

Privacy Guardrail reviews pasted text locally before it is inserted into a supported LLM chat page.

Supported beta sites:

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `gemini.google.com`

## Paste Review

1. Copy text you want to paste.
2. Paste into a supported chat input.
3. If the paste is long enough to scan, Privacy Guardrail checks it locally.
4. Review the detected spans before insertion.
5. Keep the spans you want anonymized and ignore spans you do not want changed.
6. Confirm the reviewed paste.

When no supported span is found, the extension allows the paste without showing the full review overlay.

## Placeholders

Accepted spans are replaced with typed placeholders such as:

```text
[EMAIL_1]
[PERSON_1]
[CREDIT_CARD_1]
```

The placeholder map is stored locally so that supported responses can be restored later. Placeholder numbering is stable for the local identity vault where the same original value is reused.

## Ignoring Detections

The review UI lets you ignore a detection for the current paste when it is not sensitive in context. Ignored text is pasted unchanged.

For repeated false positives, use the extension settings to add allowlist entries or adjust category sensitivity.

## Restoration

On supported chat pages, Privacy Guardrail watches model responses for placeholders and restores known originals locally where supported. Restoration depends on the local placeholder or vault record still being available. If the model rewrites a placeholder heavily, restoration may be incomplete.

## Side Panel

The side panel stays open next to every tab. Open it with **Open side panel** in the popup or with `Alt+Shift+P` (change it at `chrome://extensions/shortcuts`).

- **History & restore** lists recent anonymizations: pastes you reviewed on a chat page and text you anonymized in the panel. Paste an AI reply, or any text containing their replacements, into the restore box and the original values come back, ready to copy. The panel picks the entry whose replacements appear in the text; click an entry to choose it yourself.
- **Anonymize** takes pasted text or code, finds personal data with the same detection and settings as a paste on a chat page, and lets you switch items off before copying the result. Copying saves the entry to the history, so this also works for chat sites and tools the extension does not run on.

## Canceling A Scan

If a scan is taking too long, use the cancel control. Depending on your settings, the extension may ask whether to paste the original text or drop the pending paste.

Privacy Guardrail is an assistive beta tool. Review the final text yourself before sending it.
