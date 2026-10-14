# Redacto for VS Code

Anonymize code, logs and error messages **on this device** before you paste them into an AI chat, and turn the AI's reply back into your original values.

Requires VS Code 1.85 or newer. It works on its own: there is no browser extension to install.

## Use

Select code in an editor, or text in the Output panel or the terminal, right-click → **Redacto: Anonymize selection**. Variables, Watch expressions and test failure messages have it on their context menus too. **Ctrl+Shift+Alt+A** (macOS: **Cmd+Shift+Alt+A**) anonymizes the selection anywhere, also in the Debug Console and the Problems view. **Redacto: Anonymize clipboard** handles text you copied from somewhere else. You can also type or paste text into the panel yourself.

The panel (Redacto in the Activity Bar) shows the original next to the anonymized text and saves it to History, where an AI reply can be turned back into the original values. Your code is never changed.

Source code and documentation: <https://github.com/HunKonTech/Redacto> (`docs/developer/ide-plugins.md`).
