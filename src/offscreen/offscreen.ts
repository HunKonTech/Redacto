import type { Message } from '../shared/message-types';
import { initDebugFlag } from './debug';
import { handleOffscreenMessage } from './offscreen-handler';

initDebugFlag();

/**
 * Offscreen document — receives DETECT_PII messages from the service worker,
 * runs the WASM detection pipeline, and returns results.
 */
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) =>
  handleOffscreenMessage(message, sendResponse),
);

console.log('[PG:offscreen] Offscreen document ready');
