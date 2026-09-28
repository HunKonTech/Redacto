import { withIdeDefaults } from '../../src/ide/ide-defaults';

describe('IDE setting defaults', () => {
  it('turns identifier renaming on when nothing is stored', () => {
    expect(withIdeDefaults(undefined)).toEqual({ pg_settings: { codeAnonymization: 'full' } });
    expect(withIdeDefaults({ other: 1 })).toEqual({ other: 1, pg_settings: { codeAnonymization: 'full' } });
  });

  it('keeps the other stored settings', () => {
    expect(withIdeDefaults({ pg_settings: { debug: true } })).toEqual({
      pg_settings: { debug: true, codeAnonymization: 'full' },
    });
  });

  it('keeps a mode the user chose', () => {
    const local = { pg_settings: { codeAnonymization: 'secrets' } };
    expect(withIdeDefaults(local)).toEqual(local);
  });
});
