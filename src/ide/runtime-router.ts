/**
 * Redacto — `chrome.runtime.sendMessage` inside the IDE webview
 *
 * Plays the service worker's part for the messages the side panel and the
 * detection pipeline send, then hands them to the offscreen handler in this
 * same page. Anything else (status broadcasts, popup-only requests) has no
 * receiver here and resolves to undefined, like a message nobody answers.
 *
 * In the IDE plugins the Local AI model comes from the host (host-model.ts):
 * until it is there, detection runs pattern-only and the status reports the
 * download, as the service worker does in the extension.
 */

import { detectionOptionsFromSettings } from '../shared/detection-config';
import type { DetectPiiRequest, GetNerStatusRequest, Message } from '../shared/message-types';
import { loadSettings } from '../shared/storage';
import { handleOffscreenMessage } from '../offscreen/offscreen-handler';
import { hostModelNerStatus, hostModelPending, requestHostModel } from './host-model';

const HANDLED = new Set([
  'DETECT_PII',
  'CLASSIFY_IDENTIFIERS',
  'GET_NER_STATUS',
  'CANCEL_DETECTION',
  'DOWNLOAD_LOCAL_AI_MODEL',
]);

function viaOffscreen(message: Message): Promise<unknown> {
  return new Promise((resolve) => {
    handleOffscreenMessage(message, resolve);
  });
}

export async function routeRuntimeMessage(message: unknown): Promise<unknown> {
  const msg = message as Message;
  if (!msg || typeof msg !== 'object' || !HANDLED.has(msg.type)) return undefined;
  if (msg.type === 'DOWNLOAD_LOCAL_AI_MODEL') {
    requestHostModel();
    return { ok: true };
  }
  if (msg.type === 'DETECT_PII') {
    // The service worker merges the stored settings in before detection.
    const settings = await loadSettings();
    const request = msg as DetectPiiRequest;
    const config = detectionOptionsFromSettings(settings, request.payload.config);
    if (await hostModelPending(config)) config.ner_provider = 'off';
    return viaOffscreen({ ...request, payload: { ...request.payload, config } });
  }
  if (msg.type === 'GET_NER_STATUS') {
    const config = detectionOptionsFromSettings(await loadSettings(), (msg as GetNerStatusRequest).payload?.config);
    if (await hostModelPending(config)) return hostModelNerStatus(config);
  }
  return viaOffscreen(msg);
}
