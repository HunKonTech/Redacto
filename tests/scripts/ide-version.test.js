const { version, semverVersion } = require('../../scripts/ide/common');

const packageVersion = require('../../package.json').version;

describe('IDE plugin version', () => {
  test('carries the CI build number, as the browser packages do', () => {
    expect(version({ PG_BUILD_NUMBER: '17' })).toBe(`${packageVersion}.17`);
    expect(version({ PG_BUILD_NUMBER: '17', PG_BASE_VERSION: '0.6.1' })).toBe('0.6.1.17');
  });

  test("is package.json's version outside CI", () => {
    expect(version({})).toBe(packageVersion);
  });

  test('turns the build number into the patch part for VS Code', () => {
    expect(semverVersion('0.5.0.17')).toBe('0.5.17');
    expect(semverVersion('0.6.1.18')).toBe('0.6.18');
    expect(semverVersion('0.5.0')).toBe('0.5.0');
  });
});
