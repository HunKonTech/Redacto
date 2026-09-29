// Redacto — JetBrains IDE plugin.
//
// Built by scripts/ide/build-jetbrains.js (`npm run build:ide:jetbrains`) around
// the shared side panel in ../../dist-ide/webview. The result is a zip for
// "Install Plugin from Disk…"; no publishing (publishPlugin / signPlugin) is
// configured, on purpose — this plugin is never uploaded to the Marketplace.

plugins {
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.hunkontech.privacyguardrail"
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(providers.gradleProperty("platformVersion"))
    }
}

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
    buildSearchableOptions = false
    instrumentCode = false
    pluginConfiguration {
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = "242"
            untilBuild = provider { null }
        }
    }
}

val webviewDir = layout.projectDirectory.dir("../../dist-ide/webview")

tasks {
    // The panel ships next to the plugin's jars (<plugin>/webview/), not inside
    // them: PanelAssets serves it from there without unpacking ~50 MB of models.
    prepareSandbox {
        doFirst {
            require(webviewDir.file("index.html").asFile.exists()) {
                "dist-ide/webview is missing — run `npm run build:ide-webview` in the repository root first."
            }
        }
        from(webviewDir) {
            into(pluginName.map { "$it/webview" })
        }
    }
}
