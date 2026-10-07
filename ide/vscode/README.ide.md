# Redacto for VS Code

The Redacto side panel inside VS Code: select code in an editor, or text in
the Output panel or the terminal, right-click → **Redacto: Anonymize
selection**. Variables, Watch expressions and test failure messages have it on
their context menus too. **Ctrl+Shift+Alt+A** (macOS: **Cmd+Shift+Alt+A**)
anonymizes the selection anywhere, also in the Debug Console and the Problems
view. You can also type or paste text into the panel yourself.
The panel shows the original next to the anonymized text and saves it to
History, where an AI reply can be turned back into the original values.
Your code is never changed. Detection (rules + the local AI model) runs on
this device.

Source code and documentation:
<https://github.com/HunKonTech/Redacto>
(`docs/developer/ide-plugins.md`).
