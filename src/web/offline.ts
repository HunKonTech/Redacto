/**
 * Redacto — offline use of the web page
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
import { onLocaleChange, translate, type MessageKey, type MessageParams } from '../shared/i18n';
import { isOfflineStatus, runOfflineModelTask, type OfflineStatus } from './offline-model';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;


/** The footer line, kept as a message key so a language change can redraw it. */
let shown: { status: HTMLElement; key: MessageKey; params?: MessageParams } | null = null;

function show(status: HTMLElement, key: MessageKey, params?: MessageParams): void {
  shown = { status, key, params };
  status.textContent = translate(key, params);
}

onLocaleChange(() => {
  if (shown) shown.status.textContent = translate(shown.key, shown.params);
});

/** Set by a click on the footer button until the worker reports the save running. */
let savePending = false;

function render(status: HTMLElement, button: HTMLButtonElement, message: OfflineStatus | null): void {
  if (!message) {
    show(status, 'web.offline.preparing');
    button.hidden = true;
    return;
  }
  const { modelFiles, modelFilesCached, error, busy } = message;
  const modelReady = modelFiles === 0 || modelFilesCached === modelFiles;
  if (busy || error || modelReady) savePending = false;
  if (busy === 'delete-models') {
    show(status, 'web.offline.deleting');
  } else if (busy) {
    show(status, 'web.offline.savingProgress', { cached: modelFilesCached, total: modelFiles });
  } else if (error) {
    show(status, 'web.offline.modelError', { error });
  } else if (modelReady) {
    show(status, modelFiles === 0 ? 'web.offline.ready' : 'web.offline.readyWithModel');
  } else if (savePending) {
    show(status, 'web.offline.saving');
  } else {
    show(status, 'web.offline.rulesOnly');
  }
  button.hidden = modelReady;
  button.disabled = Boolean(busy) || savePending;
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
    show(status, 'web.offline.unsupported');
    return;
  }

  render(status, button, null);
  reloadOnNewVersion();
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (isOfflineStatus(event.data)) render(status, button, event.data);
  });

  button.addEventListener('click', async () => {
    savePending = true;
    button.disabled = true;
    show(status, 'web.offline.saving');
    await runOfflineModelTask('cache-models');
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
      show(status, 'web.offline.unavailable');
    });
}
