/**
 * The side panel for the IDE plugins (VS Code, JetBrains, Visual Studio):
 * one self-contained folder, `dist-ide/webview/`, each plugin loads into its
 * webview. Same loaders and the same WASM / ONNX Runtime assets as the
 * extension build (webpack.config.js); see docs/developer/ide-plugins.md.
 *
 * The Local AI model is not in the folder: the plugin host downloads it from
 * Hugging Face on first use (docs/developer/model-download.md) and reads
 * where from in `model-source.json`, emitted here. The web page
 * (webpack.web.config.js) reuses this config with the model packaged
 * (`modelSource: 'bundled'`), as it serves the model next to itself.
 */
const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const baseConfig = require('./webpack.config');
const { LocalNerAssetsPlugin, getNerAssetCopyPatterns } = require('./scripts/extension-packaging');
const { modelSourceJson } = require('./scripts/hf-model/model-source');

/** `model-source.json`: where the IDE hosts download the model from. */
class ModelSourcePlugin {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap('ModelSourcePlugin', (compilation) => {
      compilation.hooks.processAssets.tap({ name: 'ModelSourcePlugin', stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
        compilation.emitAsset('model-source.json', new sources.RawSource(modelSourceJson()));
      });
    });
  }
}

module.exports = (env = {}) => {
  const modelSource = env.modelSource || 'host';
  const base = baseConfig({ ...env, modelSource });
  const requirePreparedModel =
    (process.env.NER_MODEL_ASSETS_REQUIRED === '1' || env.requireNerModelAssets === true) && modelSource === 'bundled';
  const define = base.plugins.find((plugin) => plugin instanceof webpack.DefinePlugin);

  return {
    ...base,
    entry: {
      'ide-webview': './src/ide/ide-webview.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist-ide', 'webview'),
      filename: '[name].js',
      publicPath: 'auto',
      clean: true,
    },
    module: {
      rules: [
        ...base.module.rules,
        {
          test: /\.css$/,
          include: path.resolve(__dirname, 'src/shared/styles'),
          enforce: 'pre',
          use: path.resolve(__dirname, 'scripts/ide/rewrite-root-urls-loader.js'),
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: '[name].css' }),
      new LocalNerAssetsPlugin({ rootDir: __dirname, requirePreparedModel }),
      define,
      // The entry imports the panel only after the chrome.* shim is in place;
      // keep those imports in the one bundle rather than separate chunks.
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      new CopyPlugin({
        patterns: [
          { from: 'LICENSE', to: '.' },
          { from: 'NOTICE', to: '.' },
          { from: 'THIRD_PARTY_NOTICES.md', to: '.' },
          { from: 'src/assets/fonts', to: 'fonts' },
          { from: 'src/assets/icons/icon128.png', to: 'icon128.png' },
          { from: 'crate/pkg/privacy_guardrail_wasm_bg.wasm', to: 'wasm/[name][ext]' },
          ...getNerAssetCopyPatterns(__dirname, { includeNerModel: modelSource === 'bundled' }),
        ],
      }),
      ...(modelSource === 'host' ? [new ModelSourcePlugin()] : []),
      new HtmlWebpackPlugin({
        template: 'src/ide/ide-webview.html',
        filename: 'index.html',
        chunks: ['ide-webview'],
        // The VS Code host rewrites this file (CSP, <base>); keep it plain.
        scriptLoading: 'defer',
        minify: false,
      }),
    ],
    optimization: {},
    devtool: false,
    performance: { hints: false },
  };
};
