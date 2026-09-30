/**
 * Redacto — `chrome.runtime.sendMessage` inside the IDE webview
 *
 * Plays the service worker's part for the messages the side panel and the
 * detection pipeline send, then hands them to the offscreen handler in this
 * same page. Anything else (status broadcasts, popup-only requests) has no
 * receiver here and resolves to undefined, like a message nobody answers.
 */

import { detectionOptionsFromSettings } from '../shared/detection-config';
import type { DetectPiiRequest, Message } from '../shared/message-types';
import { loadSettings } from '../shared/storage';
import { handleOffscreenMessage } from '../offscreen/offscreen-handler';

const HANDLED = new Set(['DETECT_PII', 'CLASSIFY_IDENTIFIERS', 'GET_NER_STATUS', 'CANCEL_DETECTION']);

function viaOffscreen(message: Message): Promise<unknown> {
  return new Promise((resolve) => {
    handleOffscreenMessage(message, resolve);
  });
}

export async function routeRuntimeMessage(message: unknown): Promise<unknown> {
  const msg = message as Message;
  if (!msg || typeof msg !== 'object' || !HANDLED.has(msg.type)) return undefined;
  if (msg.type === 'DETECT_PII') {
    // The service worker merges the stored settings in before detection.
    const settings = await loadSettings();
    const request = msg as DetectPiiRequest;
    return viaOffscreen({
      ...request,
      payload: { ...request.payload, config: detectionOptionsFromSettings(settings, request.payload.config) },
    });
  }
  return viaOffscreen(msg);
}
