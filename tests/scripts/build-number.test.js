const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  BUILD_NUMBER_FILE,
  buildManifestVersion,
  ciBuildVersion,
  readBuildNumber,
} = require('../../scripts/build-number');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pg-build-number-'));
}

describe('buildManifestVersion', () => {
  test('appends a build number that grows by one per build', () => {
    const root = tempRoot();
    expect(buildManifestVersion('0.5.0', root, {})).toBe('0.5.0.1');
    expect(buildManifestVersion('0.5.0', root, {})).toBe('0.5.0.2');
    expect(readBuildNumber(root)).toBe(2);
  });

  test('keeps counting from an existing counter file', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, BUILD_NUMBER_FILE), '41\n');
    expect(buildManifestVersion('0.5.0', root, {})).toBe('0.5.0.42');
  });

  test('release builds keep the plain version and leave the counter alone', () => {
    const root = tempRoot();
    expect(buildManifestVersion('0.5.0', root, { PG_RELEASE_BUILD: '1' })).toBe('0.5.0');
    expect(fs.existsSync(path.join(root, BUILD_NUMBER_FILE))).toBe(false);
  });
});

describe('ciBuildVersion', () => {
  test('is null outside CI', () => {
    expect(ciBuildVersion('0.5.0', {})).toBeNull();
  });

  test('appends the build number to the base version from the variable', () => {
    expect(ciBuildVersion('0.5.0', { PG_BUILD_NUMBER: '9' })).toBe('0.5.0.9');
    expect(ciBuildVersion('0.5.0', { PG_BUILD_NUMBER: '9', PG_BASE_VERSION: '0.6.1' })).toBe('0.6.1.9');
    expect(ciBuildVersion('0.5.0', { PG_BUILD_NUMBER: '9', PG_BASE_VERSION: ' ' })).toBe('0.5.0.9');
  });

  test('rejects values Chrome would not accept', () => {
    expect(() => ciBuildVersion('0.5.0', { PG_BUILD_NUMBER: '70000' })).toThrow(/PG_BUILD_NUMBER/);
    expect(() => ciBuildVersion('0.5.0', { PG_BUILD_NUMBER: 'x' })).toThrow(/PG_BUILD_NUMBER/);
    expect(() => ciBuildVersion('0.5.0', { PG_BUILD_NUMBER: '1', PG_BASE_VERSION: 'v0.5' })).toThrow(/PG_BASE_VERSION/);
  });

  test('wins over the release and local build numbers in the manifest', () => {
    const root = tempRoot();
    expect(buildManifestVersion('0.5.0', root, { PG_BUILD_NUMBER: '12', PG_RELEASE_BUILD: '1' })).toBe('0.5.0.12');
    expect(fs.existsSync(path.join(root, BUILD_NUMBER_FILE))).toBe(false);
  });
});
