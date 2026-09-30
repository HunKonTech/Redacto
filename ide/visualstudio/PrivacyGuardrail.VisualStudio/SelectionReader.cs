using System;
using EnvDTE;
using EnvDTE80;
using Microsoft.VisualStudio.Shell;

namespace PrivacyGuardrail.VisualStudio
{
    /// <summary>The selected text of the active code editor or Output window pane.</summary>
    internal static class SelectionReader
    {
        public static (string Text, string Source)? Read(DTE2 dte)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            try
            {
                var window = dte.ActiveWindow;
                if (window == null) return null;

                string text = null;
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
                return string.IsNullOrWhiteSpace(text) ? null : ((string, string)?)(text, source);
            }
            catch (Exception)
            {
                // A window without a text selection (designers, some tool windows).
                return null;
            }
        }
    }
}
