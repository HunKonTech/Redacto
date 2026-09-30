package com.hunkontech.privacyguardrail

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Duration
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The Local AI model, downloaded once on first use instead of shipped with
 * the plugin (~190 MB). The files listed in the Hugging Face repository's
 * `redacto-model.json` (repository and revision: `model-source.json` next to
 * the panel) go to `<IDE system>/privacy-guardrail/local-ai-model/<version>/`,
 * each checked against its size and SHA-256; the manifest is written last and
 * marks the version complete. A newer model is looked for once per plugin
 * version and replaces the old one only once it is complete. Only model files
 * are downloaded; no user content leaves the device.
 *
 * PanelAssets serves the ready version to the panel under
 * https://pg.local/downloaded-model/<version>/; progress shows in the IDE's
 * status bar and, through `model` messages, in the panel. Same design as the
 * other hosts; see docs/developer/model-download.md in the repository root.
 */
@Service(Service.Level.APP)
class ModelDownload {
    val modelDir: Path = PathManager.getSystemDir().resolve("privacy-guardrail").resolve("local-ai-model")

    private val listeners = CopyOnWriteArrayList<() -> Unit>()
    private val running = AtomicBoolean(false)

    @Volatile
    private var state = State(readyVersion = readyVersionOnDisk())

    /** src/ide/protocol.ts `HostModelState`, without `baseUrl`. */
    data class State(
        val phase: String = "idle",
        val readyVersion: String? = null,
        val targetVersion: String? = null,
        val receivedBytes: Long = 0,
        val totalBytes: Long = 0,
        val error: String? = null,
    )

    private data class ManifestFile(val path: String, val size: Long, val sha256: String)

    private class Manifest(val version: String, val files: List<ManifestFile>, val text: String)

    fun addListener(listener: () -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    /** The state as the panel expects it (`HostModelState`). */
    fun toJson(): JsonObject {
        val current = state
        return JsonObject().apply {
            addProperty("phase", current.phase)
            current.readyVersion?.let {
                addProperty("readyVersion", it)
                addProperty("baseUrl", "${PanelAssets.MODEL_URL_PREFIX}$it/")
            }
            current.targetVersion?.let { addProperty("targetVersion", it) }
            addProperty("receivedBytes", current.receivedBytes)
            addProperty("totalBytes", current.totalBytes)
            current.error?.let { addProperty("error", it) }
        }
    }

    /**
     * Makes sure the model is on disk and, once per plugin version, up to
     * date, as a background task with the IDE's progress indicator.
     */
    fun ensure() {
        if (!running.compareAndSet(false, true)) return
        val ready = readyVersionOnDisk()
        state = state.copy(readyVersion = ready)
        if (ready != null && readStored()?.get("checkedPluginVersion")?.asString == pluginVersion()) {
            update(state.copy(phase = "idle", error = null))
            running.set(false)
            return
        }
        val title = if (ready == null) "Redacto: downloading the Local AI model" else "Redacto: checking for a newer Local AI model"
        ProgressManager.getInstance().run(object : Task.Backgroundable(null, title, true) {
            override fun run(indicator: ProgressIndicator) {
                try {
                    runChecked(indicator)
                } catch (e: ProcessCanceledException) {
                    update(state.copy(phase = "failed", error = "download canceled"))
                } catch (e: Exception) {
                    LOG.warn("Redacto: Local AI model download failed", e)
                    update(state.copy(phase = "failed", error = e.message ?: e.javaClass.simpleName))
                    if (state.readyVersion == null) notifyFailure()
                } finally {
                    running.set(false)
                }
            }
        })
    }

    private fun runChecked(indicator: ProgressIndicator) {
        update(state.copy(phase = "checking", error = null))
        indicator.isIndeterminate = true
        val source = JsonParser.parseString(Files.readString(PanelAssets.webviewDir()!!.resolve("model-source.json"))).asJsonObject
        val repo = source.get("repo").asString
        val revision = URLEncoder.encode(source.get("revision").asString, StandardCharsets.UTF_8)
        val fileUrl = { file: String -> "https://huggingface.co/$repo/resolve/$revision/$file" }

        val manifestResponse = http.send(request(fileUrl(MANIFEST_FILE)), HttpResponse.BodyHandlers.ofString())
        if (manifestResponse.statusCode() != 200) throw IllegalStateException("$MANIFEST_FILE: HTTP ${manifestResponse.statusCode()}")
        val manifest = parseManifest(manifestResponse.body())

        if (!isComplete(manifest.version)) download(manifest, fileUrl, indicator)

        writeStored(manifest.version)
        Files.list(modelDir).use { entries ->
            entries.filter { it.fileName.toString() != manifest.version && it.fileName.toString() != STATE_FILE }
                .forEach { it.toFile().deleteRecursively() }
        }
        update(State(phase = "idle", readyVersion = manifest.version))
    }

    private fun download(manifest: Manifest, fileUrl: (String) -> String, indicator: ProgressIndicator) {
        val total = manifest.files.sumOf { it.size }
        val partial = modelDir.resolve("${manifest.version}.partial")
        partial.toFile().deleteRecursively()
        Files.createDirectories(partial)
        update(state.copy(phase = "downloading", targetVersion = manifest.version, receivedBytes = 0, totalBytes = total))
        indicator.isIndeterminate = false

        var received = 0L
        var lastReport = 0L
        val buffer = ByteArray(256 * 1024)
        for (file in manifest.files) {
            indicator.checkCanceled()
            val target = partial.resolve(file.path).normalize()
            require(target.startsWith(partial)) { "${file.path}: outside the model folder" }
            Files.createDirectories(target.parent)
            val response = http.send(request(fileUrl(file.path)), HttpResponse.BodyHandlers.ofInputStream())
            if (response.statusCode() != 200) {
                response.body().close()
                throw IllegalStateException("${file.path}: HTTP ${response.statusCode()}")
            }
            val digest = MessageDigest.getInstance("SHA-256")
            var fileBytes = 0L
            response.body().use { input ->
                Files.newOutputStream(target).use { output ->
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        fileBytes += read
                        if (fileBytes > file.size) throw IllegalStateException("${file.path}: larger than the expected ${file.size} bytes")
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                        received += read
                        val now = System.currentTimeMillis()
                        if (now - lastReport >= PROGRESS_INTERVAL_MS) {
                            lastReport = now
                            indicator.checkCanceled()
                            indicator.fraction = if (total > 0) received.toDouble() / total else 0.0
                            indicator.text2 = "${received / MB} MB of ${total / MB} MB"
                            update(state.copy(receivedBytes = received))
                        }
                    }
                }
            }
            if (fileBytes != file.size) throw IllegalStateException("${file.path}: got $fileBytes bytes, expected ${file.size}")
            update(state.copy(phase = "verifying", receivedBytes = received))
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            if (actual != file.sha256) throw IllegalStateException("${file.path}: SHA-256 mismatch (downloaded file is not the published model)")
            update(state.copy(phase = "downloading"))
        }

        // Last: marks the version complete.
        Files.writeString(partial.resolve(MANIFEST_FILE), manifest.text)
        val finalDir = modelDir.resolve(manifest.version)
        finalDir.toFile().deleteRecursively()
        Files.move(partial, finalDir)
    }

    private fun update(next: State) {
        state = next
        for (listener in listeners) listener()
    }

    private fun notifyFailure() {
        NotificationGroupManager.getInstance().getNotificationGroup("Redacto")
            .createNotification(
                "Redacto: the Local AI model could not be downloaded",
                "${state.error ?: "Unknown error"}. Pattern-based detection keeps working meanwhile.",
                NotificationType.WARNING,
            )
            .addAction(NotificationAction.createSimpleExpiring("Try again") { ensure() })
            .notify(null)
    }

    private fun parseManifest(text: String): Manifest {
        val json = JsonParser.parseString(text).asJsonObject
        val version = json.get("version")?.asString
        val files = json.getAsJsonArray("files")?.map {
            val file = it.asJsonObject
            ManifestFile(file.get("path").asString, file.get("size").asLong, file.get("sha256").asString)
        }
        val valid = json.get("format")?.asInt == 1 &&
            version != null && VERSION.matches(version) &&
            !files.isNullOrEmpty() &&
            files.all { PATH.matches(it.path) && ".." !in it.path.split('/') && it.size >= 0 && SHA256.matches(it.sha256) }
        if (!valid) throw IllegalStateException("$MANIFEST_FILE is not a valid model manifest.")
        return Manifest(version!!, files!!, text)
    }

    private fun isComplete(version: String): Boolean = Files.isRegularFile(modelDir.resolve(version).resolve(MANIFEST_FILE))

    private fun readyVersionOnDisk(): String? =
        readStored()?.get("readyVersion")?.asString?.takeIf { isComplete(it) }

    private fun readStored(): JsonObject? = try {
        val file = modelDir.resolve(STATE_FILE)
        if (Files.isRegularFile(file)) JsonParser.parseString(Files.readString(file)).asJsonObject else null
    } catch (e: Exception) {
        null
    }

    private fun writeStored(readyVersion: String) {
        Files.createDirectories(modelDir)
        Files.writeString(modelDir.resolve(STATE_FILE), JsonObject().apply {
            addProperty("readyVersion", readyVersion)
            addProperty("checkedPluginVersion", pluginVersion())
        }.toString())
    }

    private fun pluginVersion(): String =
        PluginManagerCore.getPlugin(PluginId.getId(PanelAssets.PLUGIN_ID))?.version ?: "dev"

    private fun request(url: String): HttpRequest =
        HttpRequest.newBuilder(URI(url)).timeout(Duration.ofMinutes(10)).header("Cache-Control", "no-cache").build()

    private companion object {
        const val MANIFEST_FILE = "redacto-model.json"
        const val STATE_FILE = "state.json"
        const val PROGRESS_INTERVAL_MS = 250L
        const val MB = 1024 * 1024
        val VERSION = Regex("^[\\w.-]+$")
        val PATH = Regex("^[\\w.-]+(/[\\w.-]+)*$")
        val SHA256 = Regex("^[0-9a-f]{64}$")
        val LOG = logger<ModelDownload>()
        val http: HttpClient = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(30))
            .build()
    }
}
