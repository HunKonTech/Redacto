/**
 * Privacy Guardrail — Text handed to the side panel from outside
 *
 * The browser side panel only anonymizes what is pasted into it. The IDE
 * plugins host the same panel and hand it the selection the user picked
 * "Anonymize" on, together with where it came from; the panel shows the
 * original next to the anonymized text and records it in History.
 */

import type { PanelOrigin } from './panel-anonymizer';

export interface ExternalAnonymizeRequest {
  text: string;
  origin: PanelOrigin;
  /** Increases with every request, so the same text sent twice runs twice. */
  seq: number;
}

type Listener = (request: ExternalAnonymizeRequest) => void;

const listeners = new Set<Listener>();
let pending: ExternalAnonymizeRequest | null = null;
let seq = 0;

/** Ask the panel to anonymize `text`. Kept until a listener takes it. */
export function requestAnonymize(text: string, origin: PanelOrigin): void {
  const request = { text, origin, seq: ++seq };
  if (listeners.size === 0) {
    pending = request;
    return;
  }
  for (const listener of listeners) listener(request);
}

/** Subscribe; a request made before the panel mounted is delivered at once. */
export function onAnonymizeRequest(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const request = pending;
    pending = null;
    listener(request);
  }
  return () => listeners.delete(listener);
}
