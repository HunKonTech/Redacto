using System;
using System.Runtime.InteropServices;
using System.Windows;
using EnvDTE;
using EnvDTE80;
using Microsoft.VisualStudio.Shell;

namespace PrivacyGuardrail.VisualStudio
{
    /// <summary>
    /// The selected text of the active window: a code editor or an Output pane,
    /// or, copied, the Error List or any other window with a selection.
    /// </summary>
    internal static class SelectionReader
    {
        /// <summary>Whether "Anonymize with Redacto" is offered; cheap, runs whenever a menu opens or the key is pressed.</summary>
        public static bool IsAvailable(DTE2 dte)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            try
            {
                var window = dte.ActiveWindow;
                if (window == null || IsPanel(window)) return false;
                // Elsewhere the selection is only readable by copying it; done on click.
                if (window.Type != vsWindowType.vsWindowTypeOutput && window.Document == null) return true;
                return Read(dte) != null;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public static (string Text, string Source)? Read(DTE2 dte)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            try
            {
                var window = dte.ActiveWindow;
                if (window == null || IsPanel(window)) return null;

                string text;
                var source = "editor";
                if (window.Type == vsWindowType.vsWindowTypeOutput)
                {
                    text = dte.ToolWindows.OutputWindow.ActivePane?.TextDocument?.Selection?.Text;
                    source = "output";
                }
                else if (window.Document != null)
                {
                    text = (window.Document.Selection as TextSelection)?.Text;
                }
                else
                {
                    // Error List, Find Results, Immediate and Command windows, Locals, Watch, ...
                    text = CopySelection(dte);
                    source = IsErrorList(window) ? "errors" : "view";
                }
                return string.IsNullOrWhiteSpace(text) ? null : ((string, string)?)(text, source);
            }
            catch (Exception)
            {
                // A window without a text selection (designers, some tool windows).
                return null;
            }
        }

        private static bool IsErrorList(EnvDTE.Window window)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            return string.Equals(window.ObjectKind, WindowKinds.vsWindowKindErrorList, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>The Redacto panel itself: what is selected there is already in it.</summary>
        private static bool IsPanel(EnvDTE.Window window)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            return Guid.TryParse(window.ObjectKind, out var kind) && kind == typeof(PanelToolWindow).GUID;
        }

        /// <summary>
        /// What Edit.Copy puts on the clipboard from the active window (the Error
        /// List: its selected rows, tab-separated, with the column headers). Tool
        /// windows have no common selection API; the clipboard is put back afterwards.
        /// </summary>
        private static string CopySelection(DTE2 dte)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var saved = SaveClipboard();
            try
            {
                Clipboard.Clear();
                dte.ExecuteCommand("Edit.Copy");
                return Clipboard.ContainsText() ? Clipboard.GetText() : null;
            }
            finally
            {
                RestoreClipboard(saved);
            }
        }

        private static DataObject SaveClipboard()
        {
            try
            {
                var current = Clipboard.GetDataObject();
                if (current == null) return null;
                var copy = new DataObject();
                foreach (var format in current.GetFormats(false))
                {
                    try
                    {
                        var data = current.GetData(format, false);
                        if (data != null) copy.SetData(format, data, false);
                    }
                    catch (Exception)
                    {
                        // A format the owner cannot render now; the rest is kept.
                    }
                }
                return copy;
            }
            catch (ExternalException)
            {
                return null;
            }
        }

        private static void RestoreClipboard(DataObject saved)
        {
            try
            {
                if (saved != null && saved.GetFormats().Length > 0) Clipboard.SetDataObject(saved, true);
                else Clipboard.Clear();
            }
            catch (ExternalException)
            {
                // Another program holds the clipboard open.
            }
        }
    }
}
