using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
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
    /// src/ide/protocol.ts in the repository root).
    /// </summary>
    public sealed class PanelControl : Grid
    {
        private const string Host = "pg.local";
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
            var root = Path.Combine(Path.GetDirectoryName(typeof(PanelControl).Assembly.Location), "webview");
            // WebView2's default profile folder sits next to devenv.exe, which is not writable.
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(PanelStorage.DataDirectory, "WebView2"));
            await web.EnsureCoreWebView2Async(environment);

            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(Host, root, CoreWebView2HostResourceAccessKind.Allow);
            core.WebMessageReceived += OnWebMessage;
            core.NavigationStarting += (sender, args) => ready = false;
            core.Navigate($"https://{Host}/index.html");
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
                    Send(new JObject { ["type"] = "init", ["hostName"] = "Visual Studio", ["storage"] = storage.Snapshot() });
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
            }
        }
    }
}
