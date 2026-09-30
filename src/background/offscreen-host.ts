/**
 * The offscreen document that runs the detection pipeline, behind one API for
 * both browsers.
 *
 * Chrome's background is a service worker without a DOM, so the pipeline runs
 * in a `chrome.offscreen` document. Firefox has no offscreen API, but its
 * background is an event page with a DOM: the same page is loaded there as a
 * hidden iframe. It is an extension frame of its own, so `runtime.sendMessage`
 * reaches it exactly as it reaches the Chrome offscreen document, and the
 * message handling on both sides stays the same.
 */

interface CreateOptions {
  url: string;
  reasons: string[];
  justification: string;
}

const FRAME_ATTRIBUTE = "data-redacto-offscreen";

function chromeOffscreen(): any {
  return (chrome as any).offscreen;
}

function frameHost(): Document {
  if (typeof document === "undefined") {
    throw new Error("No offscreen document support: neither chrome.offscreen nor a background DOM is available.");
  }
  return document;
}

function currentFrame(): HTMLIFrameElement | null {
  return frameHost().querySelector<HTMLIFrameElement>(`iframe[${FRAME_ATTRIBUTE}]`);
}

export async function hasOffscreenDocument(): Promise<boolean> {
  const offscreen = chromeOffscreen();
  if (offscreen) return offscreen.hasDocument();
  return currentFrame() !== null;
}

export async function createOffscreenDocument(options: CreateOptions): Promise<void> {
  const offscreen = chromeOffscreen();
  if (offscreen) {
    await offscreen.createDocument(options);
    return;
  }

  // Chrome allows one offscreen document at a time and rejects a second one;
  // keep the same contract.
  if (currentFrame()) throw new Error("Only a single offscreen document may be created.");
  const host = frameHost();
  const frame = host.createElement("iframe");
  frame.setAttribute(FRAME_ATTRIBUTE, options.url);
  frame.src = chrome.runtime.getURL(options.url);
  await new Promise<void>((resolve, reject) => {
    frame.addEventListener("load", () => resolve(), { once: true });
    frame.addEventListener("error", () => reject(new Error(`Failed to load ${options.url}`)), { once: true });
    host.body.appendChild(frame);
  });
}

export async function closeOffscreenDocument(): Promise<void> {
  const offscreen = chromeOffscreen();
  if (offscreen) {
    await offscreen.closeDocument();
    return;
  }
  currentFrame()?.remove();
}
