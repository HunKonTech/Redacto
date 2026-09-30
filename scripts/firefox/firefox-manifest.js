/**
 * Derives the Firefox manifest from the single `manifest.json` (written for
 * Chrome), so both browsers share one manifest source. Only the keys Firefox
 * handles differently are rewritten:
 *
 * - background: Firefox runs MV3 backgrounds as event pages (`scripts`), not
 *   service workers. The same bundle runs in both.
 * - offscreen: no such API in Firefox. The event page has a DOM and hosts the
 *   offscreen page in an iframe instead (src/background/offscreen-host.ts).
 * - sidePanel / side_panel: Firefox's equivalent is `sidebar_action`.
 * - options_page: Firefox uses `options_ui`.
 * - browser_specific_settings: the add-on ID AMO signs, the minimum Firefox
 *   version, and the data-collection declaration AMO requires.
 */

const GECKO_ID = 'redacto@hunkontech.github.io';
// 140 (ESR) is the first release that reads `data_collection_permissions`;
// MAIN-world content scripts need 128.
const STRICT_MIN_VERSION = '140.0';
const CHROME_ONLY_PERMISSIONS = new Set(['offscreen', 'sidePanel']);

function toFirefoxManifest(chromeManifest) {
  const manifest = structuredClone(chromeManifest);

  manifest.background = {
    scripts: [chromeManifest.background.service_worker],
    type: chromeManifest.background.type,
  };

  manifest.permissions = chromeManifest.permissions.filter(
    (permission) => !CHROME_ONLY_PERMISSIONS.has(permission)
  );

  if (chromeManifest.side_panel) {
    delete manifest.side_panel;
    manifest.sidebar_action = {
      default_panel: chromeManifest.side_panel.default_path,
      default_title: chromeManifest.name,
      default_icon: chromeManifest.action?.default_icon ?? chromeManifest.icons,
      open_at_install: false,
    };
  }

  if (chromeManifest.options_page) {
    delete manifest.options_page;
    manifest.options_ui = { page: chromeManifest.options_page, open_in_tab: true };
  }

  manifest.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: STRICT_MIN_VERSION,
      // Redacto collects and transmits no user data (see PRIVACY.md).
      data_collection_permissions: { required: ['none'] },
    },
  };

  return manifest;
}

module.exports = { GECKO_ID, STRICT_MIN_VERSION, toFirefoxManifest };
