/**
 * Which messages the offscreen document answers.
 *
 * `runtime.sendMessage` reaches every extension frame, so a DETECT_PII or
 * GET_NER_STATUS that a content script or an extension page (popup, side
 * panel, options) sends to the background also reaches this document. Only
 * the background may answer those: it merges the stored settings in and
 * holds Local AI back while its model downloads
 * (src/shared/local-ai-model-download.ts). This document answering them too
 * would race it, with the raw request.
 */

const EXTENSION_PAGES = ['popup/', 'sidepanel/', 'options/'];

export function isFromBackground(sender: chrome.runtime.MessageSender, getUrl: (path: string) => string): boolean {
  if (sender.tab) return false;
  const url = sender.url ?? '';
  return !EXTENSION_PAGES.some((page) => url.startsWith(getUrl(page)));
}
