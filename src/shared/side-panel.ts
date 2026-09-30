/**
 * Opens the extension's side panel: `chrome.sidePanel` in Chrome, the
 * `sidebar_action` sidebar in Firefox. Both only open in response to a user
 * action, so call this straight from the click or command handler, with
 * nothing awaited before it.
 */
export function canOpenSidePanel(): boolean {
  return Boolean(chrome.sidePanel || (chrome as any).sidebarAction);
}

export function openSidePanel(windowId: number): Promise<void> {
  if (chrome.sidePanel) return chrome.sidePanel.open({ windowId });
  const sidebarAction = (chrome as any).sidebarAction;
  if (sidebarAction) return sidebarAction.open();
  return Promise.reject(new Error("This browser has no side panel API."));
}
