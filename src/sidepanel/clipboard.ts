type ClipboardWriter = (text: string) => Promise<void>;

let hostWriter: ClipboardWriter | null = null;

/**
 * Route copies through the host, for an IDE webview whose clipboard access is
 * not reliable (JCEF, WebView2 without focus).
 */
export function setClipboardWriter(writer: ClipboardWriter | null): void {
  hostWriter = writer;
}

/**
 * Write `text` to the clipboard from the side panel.
 *
 * The async Clipboard API needs the panel to have focus, which a click on one
 * of its buttons gives it. The `execCommand` fallback covers the rare profile
 * where it is still refused.
 */
export async function copyText(text: string): Promise<void> {
  if (hostWriter) return hostWriter(text);
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the legacy path.
  }
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.opacity = '0';
  document.body.appendChild(scratch);
  scratch.select();
  const copied = document.execCommand('copy');
  scratch.remove();
  if (!copied) throw new Error('The browser refused clipboard access');
}
