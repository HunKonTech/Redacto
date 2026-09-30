using System.Globalization;
using System.Windows;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;
using Newtonsoft.Json.Linq;
using DrawingColor = System.Drawing.Color;
using WpfFontFamily = System.Windows.Media.FontFamily;

namespace PrivacyGuardrail.VisualStudio
{
    /// <summary>
    /// The current Visual Studio theme as the panel's <c>IdeTheme</c>
    /// (src/ide/protocol.ts): its colors become the page's <c>--ide-*</c>
    /// variables, so the panel follows Light, Dark, Blue and custom themes.
    /// </summary>
    internal static class PanelTheme
    {
        public static JObject Snapshot(FrameworkElement resources)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var background = VSColorTheme.GetThemedColor(EnvironmentColors.ToolWindowBackgroundColorKey);
            var colors = new JObject
            {
                ["bg"] = Css(background),
                ["fg"] = Color(EnvironmentColors.ToolWindowTextColorKey),
                ["muted"] = Color(EnvironmentColors.SystemGrayTextColorKey),
                ["border"] = Color(EnvironmentColors.ToolWindowBorderColorKey),
                ["card-bg"] = Color(CommonControlsColors.TextBoxBackgroundColorKey),
                ["section-bg"] = Color(EnvironmentColors.ToolWindowBackgroundColorKey),
                ["section-fg"] = Color(EnvironmentColors.ToolWindowTextColorKey),
                ["input-bg"] = Color(CommonControlsColors.TextBoxBackgroundColorKey),
                ["input-fg"] = Color(CommonControlsColors.TextBoxTextColorKey),
                ["input-border"] = Color(CommonControlsColors.TextBoxBorderColorKey),
                ["focus"] = Color(CommonControlsColors.TextBoxBorderFocusedColorKey),
                ["accent"] = Color(EnvironmentColors.ControlLinkTextColorKey),
                ["link"] = Color(EnvironmentColors.ControlLinkTextColorKey),
                ["button-bg"] = Color(CommonControlsColors.ButtonDefaultColorKey),
                ["button-fg"] = Color(CommonControlsColors.ButtonDefaultTextColorKey),
                ["button-hover"] = Color(CommonControlsColors.ButtonHoverColorKey),
                ["button2-bg"] = Color(CommonControlsColors.ButtonColorKey),
                ["button2-fg"] = Color(CommonControlsColors.ButtonTextColorKey),
                ["button2-border"] = Color(CommonControlsColors.ButtonBorderColorKey),
                ["button2-hover"] = Color(CommonControlsColors.ButtonHoverColorKey),
                ["list-hover"] = Color(EnvironmentColors.CommandBarMouseOverBackgroundBeginColorKey),
                ["list-active-bg"] = Color(TreeViewColors.SelectedItemInactiveColorKey),
                ["list-active-fg"] = Color(TreeViewColors.SelectedItemInactiveTextColorKey),
                ["tab-bar-bg"] = Css(background),
                ["tab-active-fg"] = Color(EnvironmentColors.ToolWindowTabSelectedTextColorKey),
                ["tab-inactive-fg"] = Color(EnvironmentColors.ToolWindowTabTextColorKey),
                ["tab-active-border"] = Color(CommonControlsColors.TextBoxBorderFocusedColorKey),
                ["toggle-on"] = Color(CommonControlsColors.ButtonDefaultColorKey),
                ["toggle-knob"] = Color(CommonControlsColors.ButtonDefaultTextColorKey),
                ["toast-bg"] = Color(EnvironmentColors.ToolTipColorKey),
                ["toast-fg"] = Color(EnvironmentColors.ToolTipTextColorKey),
                ["code-bg"] = Color(CommonControlsColors.TextBoxBackgroundColorKey),
            };

            var theme = new JObject
            {
                ["kind"] = SystemParameters.HighContrast ? "high-contrast" : background.GetBrightness() < 0.5f ? "dark" : "light",
                ["colors"] = colors,
            };
            // VS's environment font (Tools → Options → Fonts and Colors → Environment), in WPF units = CSS px.
            if (resources.TryFindResource(VsFonts.EnvironmentFontFamilyKey) is WpfFontFamily family)
            {
                var font = new JObject { ["family"] = family.Source };
                if (resources.TryFindResource(VsFonts.EnvironmentFontSizeKey) is double size) font["size"] = size;
                theme["font"] = font;
            }
            return theme;
        }

        private static string Color(ThemeResourceKey key) => Css(VSColorTheme.GetThemedColor(key));

        private static string Css(DrawingColor color) =>
            color.A == 255
                ? string.Format(CultureInfo.InvariantCulture, "#{0:x2}{1:x2}{2:x2}", color.R, color.G, color.B)
                : string.Format(CultureInfo.InvariantCulture, "rgba({0}, {1}, {2}, {3:0.###})", color.R, color.G, color.B, color.A / 255.0);
    }
}
