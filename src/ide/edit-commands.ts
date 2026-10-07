/**
 * Redacto — Editing keys the IDE runs as its own commands
 *
 * Visual Studio turns Delete, Ctrl+A, Ctrl+C/X/V and Ctrl+Z/Y into its Edit.*
 * commands before WebView2 sees them, so in the panel they did nothing: text
 * could be selected with the mouse but not deleted, replaced or pasted. The
 * host now takes those commands for the panel's tool window and sends them
 * here as `edit` messages (protocol.ts); this runs them on the focused field
 * or selection the way the key would have.
 */

import type { EditCommand } from './protocol';

interface EditOptions {
  /** Clipboard text, for `paste`. */
  text?: string;
  /** Writes to the IDE clipboard. */
  copy: (text: string) => void;
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

function focusedField(doc: Document): TextField | null {
  const active = doc.activeElement;
  if (active instanceof HTMLTextAreaElement) return active;
  // Text-like inputs only: checkboxes and the like have no selection.
  if (active instanceof HTMLInputElement && active.selectionStart !== null) return active;
  return null;
}

function selectedText(doc: Document, field: TextField | null): string {
  if (field) return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
  return doc.getSelection()?.toString() ?? '';
}

/** Where a key event for the current selection would have gone. */
function eventTarget(doc: Document, field: TextField | null): EventTarget {
  if (field) return field;
  const node = doc.getSelection()?.anchorNode;
  return (node instanceof Element ? node : node?.parentElement) ?? doc.body;
}

/**
 * Replace the field's selection (or, for Delete with none, the next character)
 * as typing would, so Undo can take it back. `execCommand` is the only way to
 * keep the undo stack; the fallback just edits the value.
 */
function edit(doc: Document, field: TextField, command: 'insertText' | 'delete' | 'forwardDelete', text = ''): void {
  if (doc.execCommand?.(command, false, text)) return;
  let start = field.selectionStart ?? 0;
  let end = field.selectionEnd ?? start;
  if (start === end && command === 'forwardDelete') end = Math.min(end + 1, field.value.length);
  if (start === end && command === 'delete') start = Math.max(start - 1, 0);
  field.setRangeText(text, start, end, 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

export function runEditCommand(doc: Document, command: EditCommand, { text, copy }: EditOptions): void {
  const field = focusedField(doc);
  switch (command) {
    case 'selectAll':
      if (field) field.select();
      else doc.execCommand?.('selectAll');
      return;
    case 'delete':
      if (field && !field.readOnly) edit(doc, field, 'forwardDelete');
      return;
    case 'undo':
    case 'redo':
      if (field) doc.execCommand?.(command);
      return;
    case 'copy':
    case 'cut': {
      const selected = selectedText(doc, field);
      if (!selected) return;
      // Listeners see it like a real copy (the result view saves to History on copy).
      eventTarget(doc, field).dispatchEvent(new Event(command, { bubbles: true }));
      copy(selected);
      if (command === 'cut' && field && !field.readOnly) edit(doc, field, 'delete');
      return;
    }
    case 'paste': {
      if (!field || field.readOnly || !text) return;
      // Same handlers as a real paste (the Anonymize tab runs detection after one).
      field.dispatchEvent(new Event('paste', { bubbles: true }));
      edit(doc, field, 'insertText', text);
      return;
    }
  }
}
