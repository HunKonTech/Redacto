using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Task = System.Threading.Tasks.Task;

namespace PrivacyGuardrail.VisualStudio
{
    /// <summary>
    /// The Local AI model, downloaded once on first use instead of shipped with
    /// the extension (~190 MB). The files listed in the Hugging Face
    /// repository's <c>redacto-model.json</c> (repository and revision:
    /// <c>model-source.json</c> next to the panel) go to
    /// %LOCALAPPDATA%\PrivacyGuardrail\local-ai-model\&lt;version&gt;\, each
    /// checked against its size and SHA-256; the manifest is written last and
    /// marks the version complete. A newer model is looked for once per
    /// extension version and replaces the old one only once it is complete.
    /// Only model files are downloaded; no user content leaves the device.
    ///
    /// PanelControl serves the ready version to the panel as
    /// https://pg-model.local/&lt;version&gt;/; progress shows in the status bar
    /// and, through <c>model</c> messages, in the panel. Same design as the
    /// other hosts; see docs/developer/model-download.md in the repository root.
    /// </summary>
    internal sealed class ModelDownload
    {
        public const string Host = "pg-model.local";
        private const string ManifestFile = "redacto-model.json";
        private const string StateFile = "state.json";
        private const int ProgressIntervalMs = 250;
        private static readonly Regex VersionPattern = new Regex(@"^[\w.-]+$");
        private static readonly Regex PathPattern = new Regex(@"^[\w.-]+(/[\w.-]+)*$");
        private static readonly Regex Sha256Pattern = new Regex("^[0-9a-f]{64}$");
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };

        public static ModelDownload Instance { get; } = new ModelDownload();

        public string ModelDirectory { get; } = Path.Combine(PanelStorage.DataDirectory, "local-ai-model");

        /// <summary>Raised (on any thread) whenever <see cref="ToJson"/> changes.</summary>
        public event Action Changed;

        private readonly object gate = new object();
        private int running;
        private uint statusCookie;
        private string phase = "idle";
        private string readyVersion;
        private string targetVersion;
        private long receivedBytes;
        private long totalBytes;
        private string error;

        private ModelDownload()
        {
            readyVersion = ReadyVersionOnDisk();
        }

        private sealed class ManifestEntry
        {
            public string Path;
            public long Size;
            public string Sha256;
        }

        /// <summary>The state as the panel expects it (<c>HostModelState</c> in src/ide/protocol.ts).</summary>
        public JObject ToJson()
        {
            lock (gate)
            {
                var json = new JObject { ["phase"] = phase, ["receivedBytes"] = receivedBytes, ["totalBytes"] = totalBytes };
                if (readyVersion != null)
                {
                    json["readyVersion"] = readyVersion;
                    json["baseUrl"] = $"https://{Host}/{readyVersion}/";
                }
                if (targetVersion != null) json["targetVersion"] = targetVersion;
                if (error != null) json["error"] = error;
                return json;
            }
        }

        /// <summary>
        /// Makes sure the model is on disk and, once per extension version, up to
        /// date. Runs in the background; a call while one runs does nothing.
        /// </summary>
        public void Ensure()
        {
            if (Interlocked.Exchange(ref running, 1) == 1) return;
            Task.Run(RunAsync).FileAndForget("PrivacyGuardrail/ModelDownload");
        }

        private async Task RunAsync()
        {
            try
            {
                var ready = ReadyVersionOnDisk();
                lock (gate) readyVersion = ready;
                if (ready != null && (string)ReadStored()?["checkedExtensionVersion"] == ExtensionVersion())
                {
                    Update(() => { phase = "idle"; error = null; });
                    return;
                }

                Update(() => { phase = "checking"; error = null; });
                var source = JObject.Parse(File.ReadAllText(Path.Combine(PanelControl.WebviewDirectory, "model-source.json")));
                var repo = (string)source["repo"];
                var revision = Uri.EscapeDataString((string)source["revision"]);
                Func<string, string> fileUrl = file => $"https://huggingface.co/{repo}/resolve/{revision}/{file}";

                string manifestText;
                using (var response = await Http.GetAsync(fileUrl(ManifestFile)))
                {
                    if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"{ManifestFile}: HTTP {(int)response.StatusCode}");
                    manifestText = await response.Content.ReadAsStringAsync();
                }
                var (version, files) = ParseManifest(manifestText);

                if (!IsComplete(version)) await DownloadAsync(version, files, manifestText, fileUrl);

                WriteStored(version);
                foreach (var entry in Directory.EnumerateFileSystemEntries(ModelDirectory))
                {
                    var name = Path.GetFileName(entry);
                    if (name == version || name == StateFile) continue;
                    if (Directory.Exists(entry)) Directory.Delete(entry, true);
                    else File.Delete(entry);
                }
                Update(() =>
                {
                    phase = "idle";
                    readyVersion = version;
                    targetVersion = null;
                    receivedBytes = totalBytes = 0;
                    error = null;
                });
            }
            catch (Exception ex)
            {
                Update(() => { phase = "failed"; error = ex.Message; });
            }
            finally
            {
                Interlocked.Exchange(ref running, 0);
            }
        }

        private async Task DownloadAsync(string version, List<ManifestEntry> files, string manifestText, Func<string, string> fileUrl)
        {
            var total = files.Sum(file => file.Size);
            var partial = Path.Combine(ModelDirectory, version + ".partial");
            if (Directory.Exists(partial)) Directory.Delete(partial, true);
            Directory.CreateDirectory(partial);
            Update(() => { phase = "downloading"; targetVersion = version; receivedBytes = 0; totalBytes = total; });

            long received = 0;
            var lastReport = Environment.TickCount;
            var buffer = new byte[256 * 1024];
            foreach (var file in files)
            {
                var target = Path.GetFullPath(Path.Combine(partial, file.Path.Replace('/', Path.DirectorySeparatorChar)));
                if (!target.StartsWith(Path.GetFullPath(partial) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException($"{file.Path}: outside the model folder");
                }
                Directory.CreateDirectory(Path.GetDirectoryName(target));

                long fileBytes = 0;
                string actual;
                using (var response = await Http.GetAsync(fileUrl(file.Path), HttpCompletionOption.ResponseHeadersRead))
                {
                    if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"{file.Path}: HTTP {(int)response.StatusCode}");
                    using (var input = await response.Content.ReadAsStreamAsync())
                    using (var output = File.Create(target))
                    using (var sha = SHA256.Create())
                    {
                        int read;
                        while ((read = await input.ReadAsync(buffer, 0, buffer.Length)) > 0)
                        {
                            fileBytes += read;
                            if (fileBytes > file.Size) throw new InvalidOperationException($"{file.Path}: larger than the expected {file.Size} bytes");
                            sha.TransformBlock(buffer, 0, read, null, 0);
                            await output.WriteAsync(buffer, 0, read);
                            received += read;
                            if (unchecked(Environment.TickCount - lastReport) >= ProgressIntervalMs)
                            {
                                lastReport = Environment.TickCount;
                                var soFar = received;
                                Update(() => receivedBytes = soFar);
                            }
                        }
                        sha.TransformFinalBlock(buffer, 0, 0);
                        actual = string.Concat(sha.Hash.Select(b => b.ToString("x2")));
                    }
                }
                if (fileBytes != file.Size) throw new InvalidOperationException($"{file.Path}: got {fileBytes} bytes, expected {file.Size}");
                var done = received;
                Update(() => { phase = "verifying"; receivedBytes = done; });
                if (actual != file.Sha256) throw new InvalidOperationException($"{file.Path}: SHA-256 mismatch (downloaded file is not the published model)");
                Update(() => phase = "downloading");
            }

            // Last: marks the version complete.
            File.WriteAllText(Path.Combine(partial, ManifestFile), manifestText);
            var finalDir = Path.Combine(ModelDirectory, version);
            if (Directory.Exists(finalDir)) Directory.Delete(finalDir, true);
            Directory.Move(partial, finalDir);
        }

        private void Update(Action change)
        {
            lock (gate) change();
            Changed?.Invoke();
            ThreadHelper.JoinableTaskFactory.RunAsync(ShowInStatusBarAsync).FileAndForget("PrivacyGuardrail/ModelStatus");
        }

        /// <summary>Progress bar in the status bar while downloading; a message when the first download fails.</summary>
        private async Task ShowInStatusBarAsync()
        {
            await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (!(ServiceProvider.GlobalProvider.GetService(typeof(SVsStatusbar)) is IVsStatusbar bar)) return;
            string currentPhase, currentError, ready;
            long received, total;
            lock (gate)
            {
                currentPhase = phase;
                currentError = error;
                ready = readyVersion;
                received = receivedBytes;
                total = totalBytes;
            }
            var active = currentPhase == "downloading" || currentPhase == "verifying";
            var percent = total > 0 ? (uint)(received * 100 / total) : 0;
            var label = ready == null ? "Redacto: downloading the Local AI model" : "Redacto: updating the Local AI model";
            bar.Progress(ref statusCookie, active ? 1 : 0, active ? $"{label} ({percent}%)" : string.Empty, percent, 100);
            if (currentPhase == "failed" && ready == null)
            {
                bar.SetText($"Redacto: the Local AI model could not be downloaded ({currentError}). Pattern-based detection keeps working; retry from the Redacto panel.");
            }
        }

        private static (string Version, List<ManifestEntry> Files) ParseManifest(string text)
        {
            var json = JObject.Parse(text);
            var version = (string)json["version"];
            var files = (json["files"] as JArray)?
                .Select(file => new ManifestEntry { Path = (string)file["path"], Size = (long?)file["size"] ?? -1, Sha256 = (string)file["sha256"] })
                .ToList();
            var valid = (int?)json["format"] == 1
                && version != null && VersionPattern.IsMatch(version)
                && files != null && files.Count > 0
                && files.All(file => file.Path != null && PathPattern.IsMatch(file.Path) && !file.Path.Split('/').Contains("..")
                    && file.Size >= 0 && file.Sha256 != null && Sha256Pattern.IsMatch(file.Sha256));
            if (!valid) throw new InvalidOperationException($"{ManifestFile} is not a valid model manifest.");
            return (version, files);
        }

        private bool IsComplete(string version) => File.Exists(Path.Combine(ModelDirectory, version, ManifestFile));

        private string ReadyVersionOnDisk()
        {
            var version = (string)ReadStored()?["readyVersion"];
            return version != null && VersionPattern.IsMatch(version) && IsComplete(version) ? version : null;
        }

        private JObject ReadStored()
        {
            try
            {
                var file = Path.Combine(ModelDirectory, StateFile);
                return File.Exists(file) ? JObject.Parse(File.ReadAllText(file)) : null;
            }
            catch (Exception ex) when (ex is IOException || ex is JsonException || ex is UnauthorizedAccessException)
            {
                return null;
            }
        }

        private void WriteStored(string version)
        {
            Directory.CreateDirectory(ModelDirectory);
            var stored = new JObject { ["readyVersion"] = version, ["checkedExtensionVersion"] = ExtensionVersion() };
            File.WriteAllText(Path.Combine(ModelDirectory, StateFile), stored.ToString(Formatting.None));
        }

        /// <summary>
        /// The installed extension's version, from its extension.vsixmanifest (the
        /// assembly version stays 1.0.0.0); falls back to the model source, so a
        /// new build pinning another model revision still checks again.
        /// </summary>
        private static string ExtensionVersion()
        {
            var installDir = Path.GetDirectoryName(PanelControl.WebviewDirectory);
            try
            {
                var match = Regex.Match(File.ReadAllText(Path.Combine(installDir, "extension.vsixmanifest")), "<Identity [^>]*Version=\"([^\"]*)\"");
                if (match.Success) return match.Groups[1].Value;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
            }
            try
            {
                return File.ReadAllText(Path.Combine(PanelControl.WebviewDirectory, "model-source.json")).Trim();
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                return "unknown";
            }
        }
    }
}
