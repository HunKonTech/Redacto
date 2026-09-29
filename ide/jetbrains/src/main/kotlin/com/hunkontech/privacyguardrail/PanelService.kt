package com.hunkontech.privacyguardrail

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.components.JBLabel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.awt.datatransfer.StringSelection
import java.util.concurrent.ConcurrentLinkedQueue
import javax.swing.JComponent
import javax.swing.SwingConstants

/**
 * One Redacto panel per project: the shared side panel in a JCEF
 * browser, plus the bridge it talks to (protocol: src/ide/protocol.ts in the
 * repository root). Selections go to the panel, which shows the original next
 * to the anonymized text; nothing is written back to the editor.
 */
@Service(Service.Level.PROJECT)
class PanelService(private val project: Project) : Disposable {
    private var browser: JBCefBrowser? = null
    private var query: JBCefJSQuery? = null

    @Volatile
    private var ready = false

    /** Selections made before the panel finished loading. */
    private val pending = ConcurrentLinkedQueue<JsonObject>()

    fun createComponent(): JComponent {
        browser?.let { return it.component }
        if (!JBCefApp.isSupported()) {
            return JBLabel("Redacto needs JCEF (the IDE's embedded browser), which is not available here.", SwingConstants.CENTER)
        }
        val root = PanelAssets.webviewDir()
            ?: return JBLabel("Redacto: the panel files are missing from the plugin.", SwingConstants.CENTER)
        JBCefApp.getInstance()
        PanelAssets.register(root)

        val created = JBCefBrowser.createBuilder().setUrl(PanelAssets.INDEX_URL).build()
        val jsQuery = JBCefJSQuery.create(created as JBCefBrowserBase)
        jsQuery.addHandler { json ->
            onMessage(json)
            null
        }
        created.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadEnd(cefBrowser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                if (!frame.isMain) return
                ready = false
                val attach = "window.__pgJcefPost = function(json) { ${jsQuery.inject("json")} };" +
                    "if (window.__pgJcefAttached) window.__pgJcefAttached();"
                cefBrowser.executeJavaScript(attach, cefBrowser.url, 0)
            }
        }, created.cefBrowser)

        Disposer.register(this, jsQuery)
        Disposer.register(this, created)
        // Follow the IDE theme and the editor font.
        val bus = ApplicationManager.getApplication().messageBus.connect(this)
        bus.subscribe(LafManagerListener.TOPIC, LafManagerListener { sendTheme() })
        bus.subscribe(EditorColorsManager.TOPIC, EditorColorsListener { sendTheme() })
        browser = created
        query = jsQuery
        return created.component
    }

    /** Show `text` anonymized in the tool window. */
    fun anonymize(text: String, source: String) {
        if (text.isBlank()) return
        pending.add(JsonObject().apply {
            addProperty("type", "anonymize")
            addProperty("text", text)
            addProperty("source", source)
        })
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)
        if (toolWindow == null) {
            flush()
            return
        }
        toolWindow.show { flush() }
    }

    private fun flush() {
        if (!ready) return
        while (true) send(pending.poll() ?: return)
    }

    private fun send(message: JsonObject) {
        val cef = browser?.cefBrowser ?: return
        // A JSON object is a JavaScript expression (Gson escapes U+2028/U+2029, the only difference).
        cef.executeJavaScript("window.__pgHostMessage && window.__pgHostMessage($message);", cef.url, 0)
    }

    private fun sendTheme() {
        if (!ready) return
        send(JsonObject().apply {
            addProperty("type", "theme")
            add("theme", PanelTheme.snapshot())
        })
    }

    private fun onMessage(json: String) {
        val message = try {
            JsonParser.parseString(json).asJsonObject
        } catch (e: Exception) {
            LOG.warn("Redacto: unreadable panel message", e)
            return
        }
        val storage = service<PanelStorage>()
        when (message.get("type")?.asString) {
            "ready" -> {
                send(JsonObject().apply {
                    addProperty("type", "init")
                    addProperty("hostName", ApplicationNamesInfo.getInstance().fullProductName)
                    add("storage", storage.snapshot())
                    add("theme", PanelTheme.snapshot())
                })
                ready = true
                flush()
            }
            "storage.set" -> storage.set(message.get("area").asString, message.getAsJsonObject("items"))
            "storage.remove" -> storage.remove(message.get("area").asString, message.getAsJsonArray("keys"))
            "copy" -> CopyPasteManager.getInstance().setContents(StringSelection(message.get("text").asString))
        }
    }

    override fun dispose() {
        browser = null
        query = null
    }

    companion object {
        const val TOOL_WINDOW_ID = "Redacto"
        private val LOG = logger<PanelService>()
    }
}
