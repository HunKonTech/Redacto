package com.hunkontech.privacyguardrail

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.EditorKind
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAwareAction
import java.awt.datatransfer.DataFlavor

/**
 * Editor and Run/Debug console context menu: anonymize the selection in the
 * Privacy Guardrail tool window. The selection itself is left as it is.
 */
class AnonymizeSelectionAction : DumbAwareAction() {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        e.presentation.isEnabledAndVisible = e.project != null && editor?.selectionModel?.hasSelection(true) == true
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val text = editor.caretModel.allCarets.mapNotNull { it.selectedText }.joinToString("\n")
        val source = if (editor.editorKind == EditorKind.CONSOLE) "console" else "editor"
        project.service<PanelService>().anonymize(text, source)
    }
}

/** Tools menu: anonymize what is on the clipboard, e.g. text copied from the terminal. */
class AnonymizeClipboardAction : DumbAwareAction() {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val text = CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor) ?: return
        project.service<PanelService>().anonymize(text, "console")
    }
}
