using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PrivacyGuardrail.VisualStudio
{
    /// <summary>
    /// The shared side panel (the extension's webview\ folder) in WebView2,
    /// served as https://pg.local/, and the bridge it talks to (protocol:
    /// src/ide/protocol.ts in the repository root). The downloaded Local AI
    /// model (ModelDownload) is served as https://pg-model.local/.
    /// </summary>
    public sealed class PanelControl : Grid
    {
        private const string Host = "pg.local";

        /// <summary>The panel files installed with the extension.</summary>
        internal static readonly string WebviewDirectory =
            Path.Combine(Path.GetDirectoryName(typeof(PanelControl).Assembly.Location), "webview");

        private readonly WebView2 web = new WebView2();
        /// <summary>Selections made before the panel finished loading.</summary>
        private readonly Queue<JObject> pending = new Queue<JObject>();
        private bool started;
        private bool ready;

        public PanelControl()
        {
            Children.Add(web);
            Loaded += (sender, args) =>
            {
                if (started) return;
                started = true;
                ThreadHelper.JoinableTaskFactory.RunAsync(InitializeAsync).FileAndForget("PrivacyGuardrail/WebView");
            };
        }

        private async Task InitializeAsync()
        {
            await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
            var root = WebviewDirectory;
            // WebView2's default profile folder sits next to devenv.exe, which is not writable.
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(PanelStorage.DataDirectory, "WebView2"));
            // No white flash in a dark theme while the page loads.
            web.DefaultBackgroundColor = VSColorTheme.GetThemedColor(EnvironmentColors.ToolWindowBackgroundColorKey);
            await web.EnsureCoreWebView2Async(environment);

            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(Host, root, CoreWebView2HostResourceAccessKind.Allow);
            // Allow: the panel (https://pg.local) loads the model from this other origin.
            var model = ModelDownload.Instance;
            Directory.CreateDirectory(model.ModelDirectory);
            core.SetVirtualHostNameToFolderMapping(ModelDownload.Host, model.ModelDirectory, CoreWebView2HostResourceAccessKind.Allow);
            model.Changed += OnModelChanged;
            core.WebMessageReceived += OnWebMessage;
            core.NavigationStarting += (sender, args) => ready = false;
            VSColorTheme.ThemeChanged += OnThemeChanged;
            core.Navigate($"https://{Host}/index.html");
        }

        private void OnThemeChanged(ThemeChangedEventArgs args)
        {
            ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                web.DefaultBackgroundColor = VSColorTheme.GetThemedColor(EnvironmentColors.ToolWindowBackgroundColorKey);
                if (ready) Send(new JObject { ["type"] = "theme", ["theme"] = PanelTheme.Snapshot(this) });
            }).FileAndForget("PrivacyGuardrail/Theme");
        }

        /// <summary>Download progress for the panel's header.</summary>
        private void OnModelChanged()
        {
            ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                if (ready) Send(new JObject { ["type"] = "model", ["state"] = ModelDownload.Instance.ToJson() });
            }).FileAndForget("PrivacyGuardrail/ModelProgress");
        }

        /// <summary>Show <paramref name="text"/> anonymized in the panel.</summary>
        public void Anonymize(string text, string source)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            pending.Enqueue(new JObject { ["type"] = "anonymize", ["text"] = text, ["source"] = source });
            Flush();
        }

        private void Flush()
        {
            if (!ready) return;
            while (pending.Count > 0) Send(pending.Dequeue());
        }

        private void Send(JObject message) => web.CoreWebView2?.PostWebMessageAsJson(message.ToString(Formatting.None));

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            JObject message;
            try
            {
                message = JObject.Parse(args.WebMessageAsJson);
            }
            catch (JsonException)
            {
                return;
            }

            var storage = PanelStorage.Instance;
            switch ((string)message["type"])
            {
                case "ready":
                    Send(new JObject
                    {
                        ["type"] = "init",
                        ["hostName"] = "Visual Studio",
                        ["storage"] = storage.Snapshot(),
                        ["theme"] = PanelTheme.Snapshot(this),
                        ["model"] = ModelDownload.Instance.ToJson(),
                    });
                    ready = true;
                    Flush();
                    break;
                case "storage.set":
                    storage.Set((string)message["area"], message["items"] as JObject);
                    break;
                case "storage.remove":
                    storage.Remove((string)message["area"], (message["keys"] as JArray)?.Select(key => (string)key) ?? Enumerable.Empty<string>());
                    break;
                case "copy":
                    Clipboard.SetText((string)message["text"] ?? string.Empty);
                    break;
                case "model.download":
                    ModelDownload.Instance.Ensure();
                    break;
            }
        }
    }
}
