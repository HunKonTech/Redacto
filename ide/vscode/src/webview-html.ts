/**
 * The built panel page for a VS Code webview: a Content Security Policy and a
 * <base> so the page's relative asset paths (wasm/, vendor/, models/, fonts/)
 * resolve to the extension's webview folder.
 */
export function panelHtml(page: string, cspSource: string, baseUri: string): string {
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    // WASM pipeline + ONNX Runtime: compiled WebAssembly and its .mjs loaders.
    `script-src ${cspSource} 'wasm-unsafe-eval' blob:`,
    `worker-src ${cspSource} blob:`,
    `connect-src ${cspSource}`,
  ].join('; ');
  const base = baseUri.endsWith('/') ? baseUri : `${baseUri}/`;
  const head = `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<base href="${base}">`;
  return page.replace(/<head>/i, `<head>\n${head}`);
}
