/**
 * Names from Go's API listing (`api/go1*.txt` in the Go repository): every
 * exported identifier of the standard library, one per line, e.g.
 *   pkg net/http, method (*Client) Do(*Request) (*Response, error)
 *   pkg net/http, type Response struct, StatusCode int
 */

function parseGoApi(texts) {
  const packages = new Map(); // import path → { name, types: Map<type, Set<members>> }
  const pkg = (path) => {
    if (!packages.has(path)) packages.set(path, { name: path.split('/').filter((part) => !/^v\d+$/.test(part)).pop(), types: new Map() });
    return packages.get(path);
  };
  const member = (path, type, name) => {
    const entry = pkg(path);
    if (!entry.types.has(type)) entry.types.set(type, new Set());
    entry.types.get(type).add(name);
  };
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const head = /^pkg ([\w./-]+)(?: \([^)]*\))?, (.*)$/.exec(line);
      if (!head) continue;
      const [, path, rest] = head;
      if (/(^|\/)(internal|vendor)(\/|$)/.test(path)) continue;
      pkg(path);
      let match = /^method \(\*?(\w+)(?:\[[^\]]*\])?\) (\w+)/.exec(rest);
      if (match) {
        member(path, match[1], match[2]);
        continue;
      }
      match = /^type (\w+) struct, (?:embedded )?\*?(?:[\w.]+\.)?(\w+)/.exec(rest);
      if (match) {
        member(path, match[1], match[2]);
        continue;
      }
      match = /^type (\w+) interface, (\w+)/.exec(rest);
      if (match) member(path, match[1], match[2]);
    }
  }
  return packages;
}

module.exports = { parseGoApi };
