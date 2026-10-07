using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.OLE.Interop;
using Microsoft.VisualStudio.Shell;

namespace PrivacyGuardrail.VisualStudio
{
    [Guid("53bfe622-869f-4e91-bf5c-2c3f879118cb")]
    public sealed class PanelToolWindow : ToolWindowPane, IOleCommandTarget
    {
        /// <summary>
        /// Visual Studio turns Delete, Ctrl+A, Ctrl+C/X/V and Ctrl+Z/Y into these
        /// Edit.* commands before WebView2 sees the key, so in the panel they did
        /// nothing. While the panel is the active window it takes them and runs
        /// them in the page (src/ide/edit-commands.ts in the repository root).
        /// </summary>
        private static readonly Dictionary<uint, string> EditCommands = new Dictionary<uint, string>
        {
            [(uint)VSConstants.VSStd97CmdID.SelectAll] = "selectAll",
            [(uint)VSConstants.VSStd97CmdID.Delete] = "delete",
            [(uint)VSConstants.VSStd97CmdID.Copy] = "copy",
            [(uint)VSConstants.VSStd97CmdID.Cut] = "cut",
            [(uint)VSConstants.VSStd97CmdID.Paste] = "paste",
            [(uint)VSConstants.VSStd97CmdID.Undo] = "undo",
            [(uint)VSConstants.VSStd97CmdID.MultiLevelUndo] = "undo",
            [(uint)VSConstants.VSStd97CmdID.Redo] = "redo",
            [(uint)VSConstants.VSStd97CmdID.MultiLevelRedo] = "redo",
        };

        public PanelToolWindow() : base(null)
        {
            Caption = "Redacto";
            Panel = new PanelControl();
            Content = Panel;
        }

        public PanelControl Panel { get; }

        int IOleCommandTarget.QueryStatus(ref Guid pguidCmdGroup, uint cCmds, OLECMD[] prgCmds, IntPtr pCmdText)
        {
            if (pguidCmdGroup != VSConstants.GUID_VSStandardCommandSet97) return (int)Constants.OLECMDERR_E_NOTSUPPORTED;
            for (var i = 0; i < cCmds; i++)
            {
                if (!EditCommands.ContainsKey(prgCmds[i].cmdID)) return (int)Constants.OLECMDERR_E_NOTSUPPORTED;
                prgCmds[i].cmdf = (uint)(OLECMDF.OLECMDF_SUPPORTED | OLECMDF.OLECMDF_ENABLED);
            }
            return VSConstants.S_OK;
        }

        int IOleCommandTarget.Exec(ref Guid pguidCmdGroup, uint nCmdID, uint nCmdexecopt, IntPtr pvaIn, IntPtr pvaOut)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            if (pguidCmdGroup != VSConstants.GUID_VSStandardCommandSet97 || !EditCommands.TryGetValue(nCmdID, out var command))
                return (int)Constants.OLECMDERR_E_NOTSUPPORTED;
            Panel.Edit(command, command == "paste" ? ClipboardText() : null);
            return VSConstants.S_OK;
        }

        private static string ClipboardText()
        {
            try
            {
                return Clipboard.ContainsText() ? Clipboard.GetText() : null;
            }
            catch (ExternalException)
            {
                // Another program holds the clipboard open.
                return null;
            }
        }
    }
}
