/**
 * The side panel for the IDE plugins (VS Code, JetBrains, Visual Studio):
 * one self-contained folder, `dist-ide/webview/`, each plugin loads into its
 * webview. Same loaders and the same WASM / ONNX Runtime / model assets as
 * the extension build (webpack.config.js); see docs/developer/ide-plugins.md.
 */
const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const baseConfig = require('./webpack.config');
const { LocalNerAssetsPlugin, getNerAssetCopyPatterns } = require('./scripts/extension-packaging');

module.exports = (env = {}) => {
  const base = baseConfig(env);
  const requirePreparedModel =
    process.env.NER_MODEL_ASSETS_REQUIRED === '1' || env.requireNerModelAssets === true;

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
          ...getNerAssetCopyPatterns(__dirname),
        ],
      }),
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
