/** Read entries of the cached source archives as data (zip, nupkg, jar, whl, tar.gz). */

const fs = require('fs');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

/** Entries of a zip-format archive whose name matches `filter`: `[{ name, data: Buffer }]`. */
function zipEntries(file, filter) {
  return new AdmZip(file)
    .getEntries()
    .filter((entry) => !entry.isDirectory && filter(entry.entryName))
    .map((entry) => ({ name: entry.entryName, data: entry.getData() }));
}

/** Entries of a .tar.gz archive (ustar + pax long names) whose name matches `filter`. */
function tarGzEntries(file, filter) {
  const tar = zlib.gunzipSync(fs.readFileSync(file));
  const out = [];
  let offset = 0;
  let paxPath = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1) || '0';
    const prefix = field(345, 155);
    let name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const match = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      paxPath = match ? match[1] : null;
      continue;
    }
    if (type === 'g') continue;
    if (paxPath) {
      name = paxPath;
      paxPath = null;
    }
    if ((type === '0' || type === '\0') && filter(name)) out.push({ name, data: Buffer.from(body) });
  }
  return out;
}

module.exports = { zipEntries, tarGzEntries };
