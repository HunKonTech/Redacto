using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PrivacyGuardrail.VisualStudio
{
    /// <summary>
    /// The panel's <c>chrome.storage</c>: <c>local</c> (History, identity vault,
    /// settings) in %LOCALAPPDATA%\PrivacyGuardrail\storage.json; <c>session</c>
    /// in memory, gone when Visual Studio closes.
    /// </summary>
    internal sealed class PanelStorage
    {
        public static readonly string DataDirectory =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PrivacyGuardrail");

        public static PanelStorage Instance { get; } = new PanelStorage();

        private readonly string file = Path.Combine(DataDirectory, "storage.json");
        private readonly object gate = new object();
        private readonly JObject local;
        private readonly JObject session = new JObject();

        private PanelStorage()
        {
            local = Read();
        }

        public JObject Snapshot()
        {
            lock (gate)
            {
                return new JObject { ["local"] = local.DeepClone(), ["session"] = session.DeepClone() };
            }
        }

        public void Set(string area, JObject items)
        {
            if (items == null) return;
            lock (gate)
            {
                var target = AreaOf(area);
                if (target == null) return;
                foreach (var item in items) target[item.Key] = item.Value?.DeepClone();
                if (target == local) Write();
            }
        }

        public void Remove(string area, IEnumerable<string> keys)
        {
            lock (gate)
            {
                var target = AreaOf(area);
                if (target == null) return;
                foreach (var key in keys) target.Remove(key);
                if (target == local) Write();
            }
        }

        private JObject AreaOf(string area)
        {
            switch (area)
            {
                case "local": return local;
                case "session": return session;
                default: return null;
            }
        }

        private JObject Read()
        {
            try
            {
                return File.Exists(file) ? JObject.Parse(File.ReadAllText(file)) : new JObject();
            }
            catch (Exception ex) when (ex is IOException || ex is JsonException || ex is UnauthorizedAccessException)
            {
                return new JObject();
            }
        }

        private void Write()
        {
            try
            {
                Directory.CreateDirectory(DataDirectory);
                var tmp = file + ".tmp";
                File.WriteAllText(tmp, local.ToString(Formatting.None));
                if (File.Exists(file)) File.Replace(tmp, file, null);
                else File.Move(tmp, file);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                // Keep working from memory; the next write tries again.
            }
        }
    }
}
