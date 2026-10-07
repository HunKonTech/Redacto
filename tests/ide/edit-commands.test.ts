/**
 * @jest-environment jsdom
 */
import { runEditCommand } from '../../src/ide/edit-commands';

function field(value: string, start: number, end = start): HTMLTextAreaElement {
  document.body.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(start, end);
  return textarea;
}

describe('IDE edit commands', () => {
  const copy = jest.fn();
  beforeEach(() => copy.mockReset());

  it('selects all of the focused field', () => {
    const textarea = field('alice@example.com', 3);
    runEditCommand(document, 'selectAll', { copy });
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, 17]);
  });

  it('deletes the selection, or the next character without one', () => {
    const textarea = field('hello world', 5, 11);
    const input = jest.fn();
    textarea.addEventListener('input', input);
    runEditCommand(document, 'delete', { copy });
    expect(textarea.value).toBe('hello');
    expect(input).toHaveBeenCalled();

    textarea.setSelectionRange(0, 0);
    runEditCommand(document, 'delete', { copy });
    expect(textarea.value).toBe('ello');
  });

  it('copies and cuts the selection through the host', () => {
    const textarea = field('token=abc123', 6, 12);
    const onCopy = jest.fn();
    textarea.addEventListener('copy', onCopy);
    runEditCommand(document, 'copy', { copy });
    expect(copy).toHaveBeenCalledWith('abc123');
    expect(onCopy).toHaveBeenCalled();
    expect(textarea.value).toBe('token=abc123');

    runEditCommand(document, 'cut', { copy });
    expect(textarea.value).toBe('token=');
  });

  it('copies a selection outside of fields, firing copy where it is', () => {
    document.body.innerHTML = '<div id="result">user_1 at host_2</div>';
    const result = document.getElementById('result')!;
    const onCopy = jest.fn();
    result.addEventListener('copy', onCopy);
    document.getSelection()!.selectAllChildren(result);
    runEditCommand(document, 'copy', { copy });
    expect(copy).toHaveBeenCalledWith('user_1 at host_2');
    expect(onCopy).toHaveBeenCalled();
  });

  it('pastes over the selection and lets paste handlers run', () => {
    const textarea = field('name: X', 6, 7);
    const onPaste = jest.fn();
    textarea.addEventListener('paste', onPaste);
    runEditCommand(document, 'paste', { copy, text: 'Alice' });
    expect(textarea.value).toBe('name: Alice');
    expect(onPaste).toHaveBeenCalled();
  });

  it('leaves read-only fields and empty selections alone', () => {
    const textarea = field('fixed', 0, 5);
    textarea.readOnly = true;
    runEditCommand(document, 'delete', { copy });
    runEditCommand(document, 'paste', { copy, text: 'x' });
    expect(textarea.value).toBe('fixed');

    field('abc', 1);
    runEditCommand(document, 'copy', { copy });
    expect(copy).not.toHaveBeenCalled();
  });
});
