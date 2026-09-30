package com.hunkontech.privacyguardrail

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.extensions.PluginId
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefCallback
import org.cef.callback.CefSchemeHandlerFactory
import org.cef.handler.CefResourceHandler
import org.cef.handler.CefResourceHandlerAdapter
import org.cef.misc.IntRef
import org.cef.misc.StringRef
import org.cef.network.CefRequest
import org.cef.network.CefResponse
import java.io.InputStream
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Serves the shared side panel (`<plugin>/webview/`, see build.gradle.kts) to
 * JCEF as https://pg.local/. A real https origin, not file://, because the
 * panel fetches its WASM, ONNX Runtime and model files, which file:// pages
 * may not.
 */
object PanelAssets {
    const val PLUGIN_ID = "com.hunkontech.privacyguardrail"
    private const val HOST = "pg.local"
    const val INDEX_URL = "https://$HOST/index.html"

    private val registered = AtomicBoolean(false)

    fun webviewDir(): Path? =
        PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))
            ?.pluginPath
            ?.resolve("webview")
            ?.takeIf { Files.isRegularFile(it.resolve("index.html")) }

    /** Call after JBCefApp is initialised, before the first page load. */
    fun register(root: Path) {
        if (!registered.compareAndSet(false, true)) return
        CefApp.getInstance().registerSchemeHandlerFactory("https", HOST, Factory(root.toAbsolutePath().normalize()))
    }

    private class Factory(private val root: Path) : CefSchemeHandlerFactory {
        override fun create(
            browser: CefBrowser?,
            frame: CefFrame?,
            schemeName: String?,
            request: CefRequest?,
        ): CefResourceHandler = FileHandler(root)
    }

    private class FileHandler(private val root: Path) : CefResourceHandlerAdapter() {
        private var stream: InputStream? = null
        private var length = 0L
        private var mime = "application/octet-stream"

        override fun processRequest(request: CefRequest, callback: CefCallback): Boolean {
            val relative = URI(request.url).path.orEmpty().removePrefix("/").ifEmpty { "index.html" }
            val file = root.resolve(relative).normalize()
            if (file.startsWith(root) && Files.isRegularFile(file)) {
                stream = Files.newInputStream(file)
                length = Files.size(file)
                mime = mimeOf(file.fileName.toString())
            }
            callback.Continue()
            return true
        }

        override fun getResponseHeaders(response: CefResponse, responseLength: IntRef, redirectUrl: StringRef) {
            if (stream == null) {
                response.status = 404
                response.statusText = "Not Found"
                responseLength.set(0)
                return
            }
            response.status = 200
            response.statusText = "OK"
            response.mimeType = mime
            responseLength.set(length.toInt())
        }

        override fun readResponse(dataOut: ByteArray, bytesToRead: Int, bytesRead: IntRef, callback: CefCallback): Boolean {
            val input = stream
            val read = input?.read(dataOut, 0, bytesToRead) ?: -1
            if (read <= 0) {
                bytesRead.set(0)
                cancel()
                return false
            }
            bytesRead.set(read)
            return true
        }

        override fun cancel() {
            stream?.close()
            stream = null
        }
    }

    private fun mimeOf(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "wasm" -> "application/wasm"
        "woff2" -> "font/woff2"
        "png" -> "image/png"
        "svg" -> "image/svg+xml"
        "txt", "md" -> "text/plain"
        else -> "application/octet-stream"
    }
}
