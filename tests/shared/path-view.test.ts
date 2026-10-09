import { buildPathSplitView } from '../../src/shared/path-view';

describe('buildPathSplitView', () => {
  test.each([
    [
      'Nézd meg: D:\\Munka\\Ügyfelek\\Kovács Béla\\szerződés.pdf holnap',
      'Nézd meg: D: Munka Ügyfelek Kovács Béla szerződés.pdf holnap',
    ],
    ['C:/Users/Anna_Kovacs/Desktop', 'C: Users Anna Kovacs Desktop'],
    ['copy \\\\fileserver\\hr\\anna.xlsx', 'copy   fileserver hr anna.xlsx'],
    ['cd /home/anna_k/src', 'cd  home anna k src'],
    ['path = "C:\\\\Users\\\\mmueller" and more_words', 'path = "C:  Users  mmueller" and more_words'],
  ])('splits the path in %j into words', (text, view) => {
    expect(buildPathSplitView(text)).toBe(view);
  });

  test.each([
    'See https://acme.hu/home/anna_k for details',
    'file:///C:/Users/anna/notes.txt',
    'and/or 12/05/2023, my_var = 1',
    'a single /etc segment',
  ])('leaves %j alone', (text) => {
    expect(buildPathSplitView(text)).toBe(text);
  });

  test('stops before a link on the same line and at the end of the line', () => {
    expect(buildPathSplitView('C:\\a_b https://x.io/a_b\nnext_line/x/y')).toBe(
      'C: a b https://x.io/a_b\nnext_line/x/y'
    );
  });

  test('keeps the length and the byte length of the text', () => {
    const text = 'D:\\Ügyfelek\\Kovács_Béla\\szerződés.pdf';
    const view = buildPathSplitView(text);
    expect(view.length).toBe(text.length);
    expect(Buffer.byteLength(view)).toBe(Buffer.byteLength(text));
  });
});
