/**
 * Privacy Guardrail — offline use of the web page
 *
 * Registers the service worker (sw.js) and drives the footer line that says
 * whether the page, and the local AI model, work without a network. The
 * model is only downloaded for offline use when the user asks for it (or
 * the first time detection loads it), as it is large.
 */

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

export function setUpOffline(): void {
  const status = document.getElementById('pg-offline-status');
  const button = document.getElementById('pg-offline-model') as HTMLButtonElement | null;
  if (!status || !button) return;
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'This browser cannot keep the page for offline use.';
    return;
  }

  render(status, button, null);
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
    .then((registration) => registration.active?.postMessage({ type: 'offline-status' }))
    .catch((err) => {
      console.warn('[PG:web] service worker registration failed', err);
      status.textContent = 'Offline use is unavailable in this browser session.';
    });
}
