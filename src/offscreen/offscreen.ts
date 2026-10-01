import type { Message } from '../shared/message-types';
import { debugLog, initDebugFlag } from '../shared/debug-log';
import { handleOffscreenMessage } from './offscreen-handler';
import { isFromBackground } from './message-sender';

initDebugFlag();

/**
 * Offscreen document — receives DETECT_PII messages from the service worker,
 * runs the WASM detection pipeline, and returns results. Messages other
 * frames send to the background are left to it (message-sender.ts).
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) =>
  isFromBackground(sender, (path) => chrome.runtime.getURL(path)) && handleOffscreenMessage(message, sendResponse),
);

debugLog('[PG:offscreen] Offscreen document ready');
