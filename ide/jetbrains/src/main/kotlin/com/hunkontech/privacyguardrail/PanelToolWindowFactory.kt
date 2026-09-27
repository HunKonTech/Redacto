package com.hunkontech.privacyguardrail

import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class PanelToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val component = project.service<PanelService>().createComponent()
        val content = ContentFactory.getInstance().createContent(component, null, false)
        toolWindow.contentManager.addContent(content)
    }
}
