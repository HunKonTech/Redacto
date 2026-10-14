# Redacto for Visual Studio

Anonymize code, logs and error messages **on this device** before you paste them into an AI chat, and turn the AI's reply back into your original values.

Requires Visual Studio 2022 (17.x) or newer (up to 18.x), on amd64 or arm64, and the Microsoft Edge WebView2 Runtime, which shows the panel. It works on its own: there is no browser extension to install.

## Use

Open the panel from View → Other Windows → Redacto. Select code in an editor, text in the Output or Command window, or rows in the Error List, right-click → **Anonymize with Redacto**, or press **Ctrl+Shift+Alt+A** in any window (Locals, Watch, Find Results, ...). You can also type or paste text into the panel yourself.

The panel shows the original next to the anonymized text and saves it to History, where an AI reply can be turned back into the original values. Your code is never changed.

Source code and documentation: <https://github.com/HunKonTech/Redacto> (`docs/developer/ide-plugins.md`).
