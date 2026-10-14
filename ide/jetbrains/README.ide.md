# Redacto for JetBrains IDEs

Anonymize code, logs and error messages **on this device** before you paste them into an AI chat, and turn the AI's reply back into your original values.

Requires a JetBrains IDE 2024.2 or newer (IntelliJ IDEA, PyCharm, WebStorm, Rider, ...) running on the bundled JetBrains Runtime, whose embedded browser (JCEF) shows the panel. It works on its own: there is no browser extension to install.

## Use

Select code in an editor or text in the Run/Debug console, right-click → **Anonymize with Redacto**; text copied from the terminal goes through **Tools → Anonymize Clipboard with Redacto**. The **Redacto** tool window on the right shows the original next to the anonymized text and saves it to History, where an AI reply can be turned back into the original values. You can also type or paste text into the panel yourself. Your code is never changed.

Source code and documentation: <https://github.com/HunKonTech/Redacto> (`docs/developer/ide-plugins.md`).
