package com.hunkontech.privacyguardrail

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * The panel's `chrome.storage`: `local` (History, identity vault, settings) in
 * `<IDE config>/privacy-guardrail/storage.json`, shared by all projects;
 * `session` in memory, gone when the IDE closes.
 */
@Service(Service.Level.APP)
class PanelStorage {
    private val file: Path = PathManager.getConfigDir().resolve("privacy-guardrail").resolve("storage.json")
    private val local: JsonObject = read()
    private val session = JsonObject()

    @Synchronized
    fun snapshot(): JsonObject = JsonObject().apply {
        add("local", local.deepCopy())
        add("session", session.deepCopy())
    }

    @Synchronized
    fun set(area: String, items: JsonObject) {
        val target = areaOf(area) ?: return
        for ((key, value) in items.entrySet()) target.add(key, value)
        if (target === local) write()
    }

    @Synchronized
    fun remove(area: String, keys: Iterable<JsonElement>) {
        val target = areaOf(area) ?: return
        for (key in keys) target.remove(key.asString)
        if (target === local) write()
    }

    private fun areaOf(area: String): JsonObject? = when (area) {
        "local" -> local
        "session" -> session
        else -> null
    }

    private fun read(): JsonObject = try {
        if (Files.isRegularFile(file)) JsonParser.parseString(Files.readString(file)).asJsonObject else JsonObject()
    } catch (e: Exception) {
        LOG.warn("Redacto storage unreadable, starting empty", e)
        JsonObject()
    }

    private fun write() {
        try {
            Files.createDirectories(file.parent)
            val tmp = file.resolveSibling("storage.json.tmp")
            Files.writeString(tmp, local.toString())
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (e: Exception) {
            LOG.warn("Redacto storage could not be saved", e)
        }
    }

    private companion object {
        val LOG = logger<PanelStorage>()
    }
}
