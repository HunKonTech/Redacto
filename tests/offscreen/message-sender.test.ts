import { isFromBackground } from '../../src/offscreen/message-sender';

const getUrl = (path: string) => `chrome-extension://abc/${path}`;

describe('offscreen message sender filter', () => {
  it('answers the background (Chrome service worker, Firefox event page)', () => {
    expect(isFromBackground({ url: 'chrome-extension://abc/background/service-worker.js' }, getUrl)).toBe(true);
    expect(isFromBackground({ url: 'chrome-extension://abc/_generated_background_page.html' }, getUrl)).toBe(true);
  });

  it('leaves content scripts and extension pages to the background', () => {
    expect(isFromBackground({ tab: { id: 1 } as chrome.tabs.Tab, url: 'https://chatgpt.com/' }, getUrl)).toBe(false);
    expect(isFromBackground({ url: 'chrome-extension://abc/popup/popup.html' }, getUrl)).toBe(false);
    expect(isFromBackground({ url: 'chrome-extension://abc/sidepanel/sidepanel.html' }, getUrl)).toBe(false);
    expect(isFromBackground({ url: 'chrome-extension://abc/options/options.html' }, getUrl)).toBe(false);
  });
});
