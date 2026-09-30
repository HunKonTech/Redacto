/** @jest-environment jsdom */
import {
  closeOffscreenDocument,
  createOffscreenDocument,
  hasOffscreenDocument,
} from '../../src/background/offscreen-host';

const OPTIONS = { url: 'offscreen/offscreen.html', reasons: ['WORKERS'], justification: 'test' };

describe('offscreen host', () => {
  afterEach(() => {
    delete (chrome as any).offscreen;
    document.body.innerHTML = '';
  });

  test('uses chrome.offscreen when the browser has it', async () => {
    const offscreen = {
      hasDocument: jest.fn().mockResolvedValue(true),
      createDocument: jest.fn().mockResolvedValue(undefined),
      closeDocument: jest.fn().mockResolvedValue(undefined),
    };
    (chrome as any).offscreen = offscreen;

    await createOffscreenDocument(OPTIONS);
    await expect(hasOffscreenDocument()).resolves.toBe(true);
    await closeOffscreenDocument();

    expect(offscreen.createDocument).toHaveBeenCalledWith(OPTIONS);
    expect(offscreen.closeDocument).toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('hosts the page in an iframe without chrome.offscreen (Firefox)', async () => {
    const created = createOffscreenDocument(OPTIONS);
    const frame = document.querySelector('iframe')!;
    expect(frame.src).toBe('chrome-extension://test/offscreen/offscreen.html');
    frame.dispatchEvent(new Event('load'));
    await created;

    await expect(hasOffscreenDocument()).resolves.toBe(true);
    await expect(createOffscreenDocument(OPTIONS)).rejects.toThrow(/single offscreen document/);

    await closeOffscreenDocument();
    await expect(hasOffscreenDocument()).resolves.toBe(false);
  });
});
