// The extension serves its pages from the package root, so its stylesheets
// point at `/fonts/…`. An IDE webview serves the panel from a folder of its
// own; make those URLs relative to the stylesheet, which sits next to fonts/.
module.exports = function rewriteRootUrls(source) {
  return source.replace(/url\((["']?)\/fonts\//g, 'url($1fonts/');
};
