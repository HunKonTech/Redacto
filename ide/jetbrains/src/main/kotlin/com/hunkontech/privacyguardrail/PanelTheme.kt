package com.hunkontech.privacyguardrail

import com.google.gson.JsonObject
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.JBColor
import com.intellij.util.ui.UIUtil
import java.awt.Color
import java.util.Locale
import javax.swing.UIManager

/**
 * The IDE's current look and feel as the panel's `IdeTheme` (src/ide/protocol.ts):
 * colors become the page's `--ide-*` variables, so the panel follows the
 * theme. Each color falls back through a few UIManager keys, which differ
 * between the classic and the New UI themes; missing ones keep the page's
 * own fallback (src/ide/theme/jetbrains.css).
 */
object PanelTheme {
    fun snapshot(): JsonObject {
        val colors = JsonObject()
        fun put(name: String, color: Color?) {
            if (color != null) colors.addProperty(name, css(color))
        }

        val fg = UIUtil.getLabelForeground()
        val muted = ui("Label.infoForeground", "Component.infoForeground", "Label.disabledForeground")
        val focus = ui("Component.focusColor", "Focus.color")
        val buttonBg = ui("Button.default.startBackground", "Button.default.background")

        put("bg", UIUtil.getPanelBackground())
        put("fg", fg)
        put("muted", muted)
        put("border", ui("Borders.color", "Separator.foreground", "Component.borderColor"))
        put("section-fg", fg)
        put("input-bg", ui("TextField.background"))
        put("input-fg", ui("TextField.foreground"))
        put("input-border", ui("Component.borderColor", "TextField.borderColor"))
        put("focus", focus)
        put("accent", ui("Link.activeForeground", "link.foreground", "Hyperlink.linkColor") ?: focus)
        put("link", ui("Link.activeForeground", "link.foreground", "Hyperlink.linkColor"))
        put("button-bg", buttonBg)
        put("button-fg", ui("Button.default.foreground"))
        put("button-hover", ui("Button.default.endBackground") ?: buttonBg)
        put("button2-bg", ui("Button.startBackground", "Button.background"))
        put("button2-fg", ui("Button.foreground"))
        put("button2-border", ui("Button.startBorderColor", "Button.borderColor"))
        put("button2-hover", ui("ActionButton.hoverBackground", "List.hoverBackground"))
        put("list-hover", ui("List.hoverBackground", "ActionButton.hoverBackground", "Table.hoverBackground"))
        put("list-active-bg", ui("List.selectionInactiveBackground", "List.selectionBackground"))
        put("list-active-fg", ui("List.selectionInactiveForeground", "List.foreground"))
        put("tab-bar-bg", ui("ToolWindow.Header.background", "ToolWindow.header.background") ?: UIUtil.getPanelBackground())
        put("tab-active-fg", fg)
        put("tab-inactive-fg", muted)
        put("tab-active-border", ui("ToolWindow.HeaderTab.underlineColor", "TabbedPane.underlineColor") ?: focus)
        put("toggle-on", ui("ToggleButton.onBackground") ?: buttonBg)
        put("toggle-off", ui("ToggleButton.offBackground"))
        put("toggle-knob", ui("ToggleButton.buttonColor"))
        put("error", ui("Label.errorForeground", "Component.errorFocusColor"))
        put("warning", ui("Component.warningFocusColor"))
        put("toast-bg", ui("Notification.background", "ToolTip.background"))
        put("toast-fg", ui("Notification.foreground", "ToolTip.foreground"))
        put("code-bg", EditorColorsManager.getInstance().globalScheme.defaultBackground)

        val font = UIUtil.getLabelFont()
        val editor = EditorColorsManager.getInstance().globalScheme
        return JsonObject().apply {
            addProperty("kind", if (JBColor.isBright()) "light" else "dark")
            add("colors", colors)
            add("font", JsonObject().apply {
                addProperty("family", font.family)
                addProperty("size", font.size)
            })
            add("editorFont", JsonObject().apply {
                addProperty("family", editor.editorFontName)
                addProperty("size", editor.editorFontSize)
            })
        }
    }

    private fun ui(vararg keys: String): Color? = keys.firstNotNullOfOrNull { UIManager.getColor(it) }

    private fun css(color: Color): String =
        if (color.alpha == 255) String.format(Locale.ROOT, "#%02x%02x%02x", color.red, color.green, color.blue)
        else String.format(Locale.ROOT, "rgba(%d, %d, %d, %.3f)", color.red, color.green, color.blue, color.alpha / 255.0)
}
