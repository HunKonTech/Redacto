/**
 * @jest-environment jsdom
 */
import { persist, readArea } from '../../src/web/browser-storage';

describe('web page storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('round-trips the shim writes through Web Storage, per area', () => {
    persist({ type: 'storage.set', area: 'local', items: { history: [{ id: 'a' }], count: 2 } });
    persist({ type: 'storage.set', area: 'session', items: { pairs: { x: 'y' } } });

    expect(readArea('local')).toEqual({ history: [{ id: 'a' }], count: 2 });
    expect(readArea('session')).toEqual({ pairs: { x: 'y' } });

    persist({ type: 'storage.remove', area: 'local', keys: ['count'] });
    expect(readArea('local')).toEqual({ history: [{ id: 'a' }] });
  });

  it('only reads its own prefixed keys', () => {
    localStorage.setItem('someone-else', '"value"');
    localStorage.setItem('privacy-guardrail:broken', '{not json');
    persist({ type: 'storage.set', area: 'local', items: { mine: true } });

    expect(readArea('local')).toEqual({ mine: true });
    expect(localStorage.getItem('someone-else')).toBe('"value"');
  });

  it('ignores messages that are not storage writes', () => {
    persist({ type: 'copy', text: 'secret' });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
