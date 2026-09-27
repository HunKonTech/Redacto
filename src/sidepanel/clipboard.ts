/**
 * Write `text` to the clipboard from the side panel.
 *
 * The async Clipboard API needs the panel to have focus, which a click on one
 * of its buttons gives it. The `execCommand` fallback covers the rare profile
 * where it is still refused.
 */
export async function copyText(text: string): Promise<void> {
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
