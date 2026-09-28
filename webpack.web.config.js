/**
 * The side panel as a static web page, `dist-web/`, published on GitHub Pages.
 * Same bundle setup as the IDE panel (webpack.ide.config.js: relative asset
 * URLs, WASM / ONNX Runtime / model assets next to the page); only the entry
 * and the HTML differ, plus the PWA files for offline use. See
 * docs/developer/web-page.md.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ideConfig = require('./webpack.ide.config');

const SERVICE_WORKER_SOURCE = path.resolve(__dirname, 'src/web/sw.js');
const NOT_CACHED = [/^sw\.js$/, /\.map$/, /\.LICENSE\.txt$/, /\.d\.ts$/, /^\.\.\//];

/**
 * Emits `sw.js`: src/web/sw.js with the list of every other emitted file
 * (the app shell, cached on install; the model, cached on use) and a hash of
 * their contents, so each build with changed files replaces the old caches.
 */
class ServiceWorkerPlugin {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap('ServiceWorkerPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        // After minification, HTML generation and the copied assets.
        { name: 'ServiceWorkerPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        () => {
          const names = compilation
            .getAssets()
            .map((asset) => asset.name)
            .filter((name) => !NOT_CACHED.some((pattern) => pattern.test(name)))
            .sort();
          const hash = (list) => {
            const digest = crypto.createHash('sha256');
            for (const name of list) digest.update(name).update(compilation.getAsset(name).source.buffer());
            return digest.digest('hex').slice(0, 16);
          };
          const models = names.filter((name) => name.startsWith('models/'));
          const shell = names.filter((name) => !name.startsWith('models/'));
          const precache = { shellHash: hash(shell), modelHash: hash(models), shell, models };
          const source = fs.readFileSync(SERVICE_WORKER_SOURCE, 'utf8');
          compilation.emitAsset(
            'sw.js',
            new sources.RawSource(`const PRECACHE = ${JSON.stringify(precache)};\n${source}`),
          );
          compilation.fileDependencies.add(SERVICE_WORKER_SOURCE);
        },
      );
    });
  }
}

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
      new CopyPlugin({
        patterns: [
          { from: 'src/web/manifest.webmanifest', to: '.' },
          { from: 'src/web/icons', to: 'icons' },
        ],
      }),
      new HtmlWebpackPlugin({
        template: 'src/web/web.html',
        filename: 'index.html',
        chunks: ['web-app'],
        scriptLoading: 'defer',
      }),
      new ServiceWorkerPlugin(),
    ],
  };
};
