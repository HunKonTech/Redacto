using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;

namespace PrivacyGuardrail.VisualStudio
{
    [Guid("53bfe622-869f-4e91-bf5c-2c3f879118cb")]
    public sealed class PanelToolWindow : ToolWindowPane
    {
        public PanelToolWindow() : base(null)
        {
            Caption = "Redacto";
            Panel = new PanelControl();
            Content = Panel;
        }

        public PanelControl Panel { get; }
    }
}
