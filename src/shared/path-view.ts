/**
 * The model reads `D:\Clients\Anna_Kovacs\offer.pdf` as one opaque run and
 * misses the name in it. In the text it is handed, path separators and
 * underscores become spaces (`D: Clients Anna Kovacs offer.pdf`), so it reads
 * the line as words and decides itself which of them form a name. The Rust
 * pipeline then widens any name it finds into the whole path.
 *
 * Every replaced character is one ASCII byte replaced by a space, so the view
 * keeps the length and byte offsets of the original: model spans on the view
 * are valid on the original text as they are.
 */

/**
 * From where a path starts (drive letter, UNC share, `~/`, `$HOME/` or an
 * absolute POSIX path of two or more segments) to the end of its line, a
 * quote, or a link that follows it on the line. Names with spaces
 * (`C:\Users\Anna Kovacs\Documents`) stay in one run. Not being in a word or
 * after `:`, `/` or `.` keeps links (`https://host/a/b`) out.
 */
const PATH_RUN_RE =
  /(?<![\p{L}\p{N}_/\\:.~$-])(?:[A-Za-z]:[\\/]|\\\\[\w.$-]+[\\/]|~[\\/]|\$HOME\/|\/(?=[^\s/\\]+\/))(?:(?!\s+[A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\n\r"'`<>|*?])*/gu;

const PATH_WORD_BREAK_RE = /[\\/_]/g;

/** `text` with the separators inside its filesystem paths turned into spaces. */
export function buildPathSplitView(text: string): string {
  return text.replace(PATH_RUN_RE, (run) => run.replace(PATH_WORD_BREAK_RE, ' '));
}
