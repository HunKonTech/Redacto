import { date, t, time } from '../../shared/i18n/reactive';
import { formatMegabytes, modelDownloadPercent, type ModelDownloadState } from '../../shared/local-ai-model-download';

/** One line on where the Local AI model download is, in the UI language. */
export function modelDownloadText(state: ModelDownloadState): string {
  const updating = Boolean(state.readyVersion);
  switch (state.phase) {
    case 'checking':
      return updating ? t('model.checking.update') : t('model.checking');
    case 'downloading':
      return t(updating ? 'model.downloading.update' : 'model.downloading', {
        percent: modelDownloadPercent(state),
        received: formatMegabytes(state.receivedBytes),
        total: formatMegabytes(state.totalBytes),
      });
    case 'verifying':
      return t('model.verifying');
    case 'failed':
      return t(updating ? 'model.failed.update' : 'model.failed', { error: state.error ?? t('model.unknownError') });
    default:
      return state.readyVersion ? t('model.ready') : t('model.notDownloaded');
  }
}

/** When the ready model was downloaded, or null when that was not recorded. */
export function modelDownloadedAt(state: ModelDownloadState): string | null {
  if (!state.readyAt) return null;
  return `${date(state.readyAt, { year: 'numeric', month: 'short', day: 'numeric' })} ${time(state.readyAt, { hour: '2-digit', minute: '2-digit' })}`;
}

export function modelSize(state: ModelDownloadState): string | null {
  return state.readyBytes ? formatMegabytes(state.readyBytes) : null;
}
