using System;
using System.ComponentModel.Design;
using System.Runtime.InteropServices;
using System.Threading;
using EnvDTE;
using EnvDTE80;
using Microsoft.VisualStudio.Shell;
using Task = System.Threading.Tasks.Task;

namespace PrivacyGuardrail.VisualStudio
{
    /// <summary>
    /// Redacto for Visual Studio: the shared side panel in a tool
    /// window, and "Anonymize with Redacto" on the code editor's and
    /// the Output window's context menus. The panel shows the original next to
    /// the anonymized text; the selection itself is never changed.
    /// </summary>
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [Guid(PackageGuidString)]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [ProvideToolWindow(typeof(PanelToolWindow), Style = VsDockStyle.Tabbed, Window = SolutionExplorerWindowGuid)]
    public sealed class PrivacyGuardrailPackage : AsyncPackage
    {
        public const string PackageGuidString = "882984f8-e76d-469c-930c-cf547dc5e836";
        // EnvDTE.Constants.vsWindowKindSolutionExplorer; attribute arguments need a constant.
        private const string SolutionExplorerWindowGuid = "3ae79031-e1bc-11d0-8f78-00a0c9110057";
        private static readonly Guid CommandSet = new Guid("0ec4a041-9151-4737-9c2f-24dceca7d1a9");
        private const int AnonymizeSelectionId = 0x0100;
        private const int OpenPanelId = 0x0101;

        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
            var commands = (OleMenuCommandService)await GetServiceAsync(typeof(IMenuCommandService));
            var dte = (DTE2)await GetServiceAsync(typeof(DTE));
            if (commands == null || dte == null) return;

            var anonymize = new OleMenuCommand(
                (sender, args) => JoinableTaskFactory.RunAsync(() => AnonymizeSelectionAsync(dte)).FileAndForget("PrivacyGuardrail/Anonymize"),
                new CommandID(CommandSet, AnonymizeSelectionId));
            anonymize.BeforeQueryStatus += (sender, args) =>
            {
                ThreadHelper.ThrowIfNotOnUIThread();
                anonymize.Visible = anonymize.Enabled = SelectionReader.Read(dte) != null;
            };
            commands.AddCommand(anonymize);

            commands.AddCommand(new MenuCommand(
                (sender, args) => JoinableTaskFactory.RunAsync(ShowPanelAsync).FileAndForget("PrivacyGuardrail/OpenPanel"),
                new CommandID(CommandSet, OpenPanelId)));
        }

        private async System.Threading.Tasks.Task<PanelControl> ShowPanelAsync()
        {
            var window = await ShowToolWindowAsync(typeof(PanelToolWindow), 0, true, DisposalToken);
            return (window as PanelToolWindow)?.Panel;
        }

        private async Task AnonymizeSelectionAsync(DTE2 dte)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(DisposalToken);
            var selection = SelectionReader.Read(dte);
            if (selection == null) return;
            var panel = await ShowPanelAsync();
            panel?.Anonymize(selection.Value.Text, selection.Value.Source);
        }
    }
}
