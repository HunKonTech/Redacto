/**
 * The side panel as a static web page, `dist-web/`, published on GitHub Pages.
 * Same bundle setup as the IDE panel (webpack.ide.config.js: relative asset
 * URLs, WASM / ONNX Runtime / model assets next to the page); only the entry
 * and the HTML differ. See docs/developer/web-page.md.
 */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ideConfig = require('./webpack.ide.config');

module.exports = (env = {}) => {
  const ide = ideConfig(env);

  return {
    ...ide,
    entry: {
      'web-app': './src/web/web-app.ts',
    },
    output: {
      ...ide.output,
      path: path.resolve(__dirname, 'dist-web'),
    },
    plugins: [
      ...ide.plugins.filter((plugin) => !(plugin instanceof HtmlWebpackPlugin)),
      new HtmlWebpackPlugin({
        template: 'src/web/web.html',
        filename: 'index.html',
        chunks: ['web-app'],
        scriptLoading: 'defer',
      }),
    ],
  };
};
