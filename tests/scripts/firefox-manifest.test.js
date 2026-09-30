const fs = require('fs');
const path = require('path');

const { GECKO_ID, toFirefoxManifest } = require('../../scripts/firefox/firefox-manifest');

const chromeManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'manifest.json'), 'utf8'));

describe('toFirefoxManifest', () => {
  const manifest = toFirefoxManifest(chromeManifest);

  test('runs the same background bundle as an event page', () => {
    expect(manifest.background).toEqual({
      scripts: [chromeManifest.background.service_worker],
      type: chromeManifest.background.type,
    });
  });

  test('drops Chrome-only permissions and keeps the rest', () => {
    expect(manifest.permissions).not.toContain('offscreen');
    expect(manifest.permissions).not.toContain('sidePanel');
    expect(manifest.permissions).toEqual(
      chromeManifest.permissions.filter((p) => p !== 'offscreen' && p !== 'sidePanel')
    );
    expect(manifest.host_permissions).toEqual(chromeManifest.host_permissions);
  });

  test('maps the side panel to a sidebar and the options page to options_ui', () => {
    expect(manifest.side_panel).toBeUndefined();
    expect(manifest.sidebar_action.default_panel).toBe(chromeManifest.side_panel.default_path);
    expect(manifest.options_page).toBeUndefined();
    expect(manifest.options_ui).toEqual({ page: chromeManifest.options_page, open_in_tab: true });
  });

  test('declares the add-on ID and no data collection', () => {
    expect(manifest.browser_specific_settings.gecko.id).toBe(GECKO_ID);
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['none'] });
  });

  test('leaves the Chrome manifest untouched', () => {
    expect(chromeManifest.background.service_worker).toBeDefined();
    expect(chromeManifest.permissions).toContain('offscreen');
  });
});
