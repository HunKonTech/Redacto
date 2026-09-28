/**
 * Privacy Guardrail — offline use of the web page
 *
 * Registers the service worker (sw.js) and drives the footer line that says
 * whether the page, and the local AI model, work without a network. The
 * model is only downloaded for offline use when the user asks for it (or
 * the first time detection loads it), as it is large.
 *
 * Each deploy (a GitHub Actions run) ships a new sw.js. The page checks for it
 * when it opens, when it comes back to the foreground and every half hour;
 * the new worker takes over at once, and the page reloads onto it — right
 * away if nothing is typed in, otherwise when the user clicks "reload".
 */

import { debugWarn } from '../shared/debug-log';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

interface OfflineStatus {
  type: 'offline-status';
  modelFiles: number;
  modelFilesCached: number;
  error?: string;
}

function render(status: HTMLElement, button: HTMLButtonElement, message: OfflineStatus | null): void {
  if (!message) {
    status.textContent = 'Preparing offline use…';
    button.hidden = true;
    return;
  }
  const { modelFiles, modelFilesCached, error } = message;
  const modelReady = modelFiles === 0 || modelFilesCached === modelFiles;
  if (error) {
    status.textContent = `Works offline; the local AI model could not be saved (${error}).`;
  } else if (modelReady) {
    status.textContent = modelFiles === 0 ? 'Works offline.' : 'Works offline, including the local AI model.';
  } else if (button.disabled) {
    status.textContent = `Saving the local AI model for offline use… (${modelFilesCached}/${modelFiles} files)`;
  } else {
    status.textContent = 'Works offline with rule-based detection; the local AI model is saved the first time it is used.';
  }
  button.hidden = modelReady;
  if (modelReady || error) button.disabled = false;
}

function hasTypedText(): boolean {
  return Array.from(document.querySelectorAll('textarea')).some((field) => field.value.trim() !== '');
}

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  const check = (): void => void registration.update().catch(() => {});
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

function reloadOnNewVersion(): void {
  // The first install also takes control of the page; only a replaced worker is an update.
  if (!navigator.serviceWorker.controller) return;
  const button = document.getElementById('pg-update') as HTMLButtonElement | null;
  let reloading = false;
  const reload = (): void => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };
  button?.addEventListener('click', reload);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasTypedText()) reload();
    else if (button) button.hidden = false;
  });
}

export function setUpOffline(): void {
  const status = document.getElementById('pg-offline-status');
  const button = document.getElementById('pg-offline-model') as HTMLButtonElement | null;
  if (!status || !button) return;
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'This browser cannot keep the page for offline use.';
    return;
  }

  render(status, button, null);
  reloadOnNewVersion();
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<OfflineStatus>) => {
    if (event.data?.type === 'offline-status') render(status, button, event.data);
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    // Ask the browser not to evict the (large) model under storage pressure.
    await navigator.storage?.persist?.().catch(() => false);
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'cache-models' });
    status.textContent = 'Saving the local AI model for offline use…';
  });

  navigator.serviceWorker
    .register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      registration.active?.postMessage({ type: 'offline-status' });
      watchForUpdates(registration);
    })
    .catch((err) => {
      debugWarn('[PG:web] service worker registration failed', err);
      status.textContent = 'Offline use is unavailable in this browser session.';
    });
}
