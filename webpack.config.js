const path = require('path');
const webpack = require('webpack');
const { modelSource: hfModelSource } = require('./scripts/hf-model/model-source');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const sveltePreprocess = require('svelte-preprocess');
const {
  LocalNerAssetsPlugin,
  getNerAssetCopyPatterns,
} = require('./scripts/extension-packaging');
const { renderTermsHtml } = require('./scripts/terms-html');
const { buildManifestVersion } = require('./scripts/build-number');
const { toFirefoxManifest } = require('./scripts/firefox/firefox-manifest');

class TermsHtmlPlugin {
  constructor(options = {}) {
    this.rootDir = options.rootDir || __dirname;
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap('TermsHtmlPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'TermsHtmlPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => {
          const sourcePath = path.join(this.rootDir, 'TERMS.md');
          const markdown = compiler.inputFileSystem.readFileSync(sourcePath, 'utf8');
          const html = renderTermsHtml(markdown);
          compilation.emitAsset('TERMS.html', new compiler.webpack.sources.RawSource(html));
          compilation.fileDependencies.add(sourcePath);
        }
      );
    });
  }
}

module.exports = (_env = {}) => {
  const requirePreparedModel =
    process.env.NER_MODEL_ASSETS_REQUIRED === '1' || _env.requireNerModelAssets === true;
  const manifestVersion = buildManifestVersion(
    JSON.parse(require('fs').readFileSync(path.join(__dirname, 'manifest.json'), 'utf8')).version,
    __dirname,
  );
  console.log(`[build] manifest version ${manifestVersion}`);
  // One code base for every browser; for Firefox (BROWSER=firefox or --env
  // browser=firefox) only the manifest and the output folder differ.
  const browser = _env.browser || process.env.BROWSER || 'chrome';
  if (!['chrome', 'firefox'].includes(browser)) {
    throw new Error(`Unknown BROWSER "${browser}"; expected chrome or firefox.`);
  }
  console.log(`[build] browser ${browser}`);
  // The Local AI model is not packaged: every browser downloads it from
  // Hugging Face on first use (src/shared/local-ai-model-download.ts), which
  // keeps the package ~70 MB instead of ~230 MB. MODEL_SOURCE=bundled packages
  // the prepared model instead, for local testing without a network.
  const modelSource = _env.modelSource || process.env.MODEL_SOURCE || 'huggingface';
  if (!['huggingface', 'bundled', 'host'].includes(modelSource)) {
    throw new Error(`Unknown MODEL_SOURCE "${modelSource}"; expected huggingface, bundled or host.`);
  }
  const { repo: modelHfRepo, revision: modelRevision } = hfModelSource();
  if (modelSource === 'bundled') {
    console.log('[build] Local AI model packaged with the build');
  } else {
    console.log(`[build] Local AI model downloaded from Hugging Face ${modelHfRepo} @ ${modelRevision}`);
  }

  return {
    entry: {
      'background/service-worker': './src/background/service-worker.ts',
      'content/content-script': './src/content/content-script.ts',
      'content/search-script': './src/content/search-script.ts',
      'content/clipboard-interceptor-page': './src/content/clipboard-interceptor-page.ts',
      'offscreen/offscreen': './src/offscreen/offscreen.ts',
      'system-check/system-check-offscreen': './src/system-check/system-check-offscreen.ts',
      'popup/popup': './src/popup/popup.ts',
      'options/options': './src/options/options.ts',
      'sidepanel/sidepanel': './src/sidepanel/sidepanel.ts',
    },

    output: {
      path: path.resolve(__dirname, browser === 'firefox' ? 'dist-firefox' : 'dist'),
      filename: '[name].js',
      clean: true,
    },

    resolve: {
      extensions: ['.svelte', '.ts', '.js', '.wasm'],
      conditionNames: ['svelte', 'browser', 'import', 'module', 'default'],
      mainFields: ['svelte', 'browser', 'module', 'main'],
    },

    module: {
      rules: [
        {
          // Transformers.js / ONNX Runtime Web / wasm-bindgen reference their
          // .wasm (and pthread worker) files via `new URL(..., import.meta.url)`.
          // Webpack would emit each referenced file as a hashed asset at the
          // dist root (~56 MB of duplicates). The runtime never uses those:
          // ner-provider.ts pins ORT to vendor/onnxruntime-web/* via wasmPaths,
          // and wasm-bridge.ts passes an explicit chrome.runtime.getURL for the
          // crate wasm. Disable URL parsing for these packages so the copies in
          // vendor/ and wasm/ (staged by CopyPlugin) stay the single source.
          test: /\.m?js$/,
          include: [
            path.resolve(__dirname, 'node_modules/@huggingface/transformers'),
            path.resolve(__dirname, 'node_modules/onnxruntime-web'),
            path.resolve(__dirname, 'crate/pkg'),
          ],
          parser: { url: false },
        },
        {
          test: /\.svelte$/,
          use: {
            loader: 'svelte-loader',
            options: {
              emitCss: true,
              compilerOptions: { runes: true },
              preprocess: sveltePreprocess({ typescript: true }),
            },
          },
        },
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          oneOf: [
            {
              // Overlay stylesheet is injected as a raw string into the
              // closed Shadow Root attached by the review overlay.
              include: path.resolve(__dirname, 'src/ui/overlay/overlay-styles.css'),
              use: [
                {
                  loader: 'css-loader',
                  options: { url: false, exportType: 'string' },
                },
              ],
            },
            {
              use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { url: false } }],
            },
          ],
        },
      ],
    },

    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),

      new LocalNerAssetsPlugin({
        rootDir: __dirname,
        // A downloaded model is not needed at build time.
        requirePreparedModel: requirePreparedModel && modelSource === 'bundled',
      }),

      new webpack.DefinePlugin({
        __REDACTO_MODEL_SOURCE__: JSON.stringify(modelSource),
        __REDACTO_MODEL_HF_REPO__: JSON.stringify(modelHfRepo),
        __REDACTO_MODEL_REVISION__: JSON.stringify(modelRevision),
      }),

      new TermsHtmlPlugin({ rootDir: __dirname }),

      // Copy static files to dist/
      new CopyPlugin({
        patterns: [
          {
            from: 'manifest.json',
            to: '.',
            transform: (content) => {
              let manifest = JSON.parse(content.toString());
              if (browser === 'firefox') manifest = toFirefoxManifest(manifest);
              manifest.version = manifestVersion;
              return `${JSON.stringify(manifest, null, 2)}\n`;
            },
          },
          { from: 'LICENSE', to: '.' },
          { from: 'NOTICE', to: '.' },
          { from: 'FORK.md', to: '.' },
          { from: 'TERMS.md', to: '.' },
          { from: 'THIRD_PARTY_NOTICES.md', to: '.' },
          { from: 'docs/assets/redacto-logo-black.png', to: 'legal/redacto-logo-black.png' },
          { from: 'src/assets', to: 'assets', globOptions: { ignore: ['**/.DS_Store'] } },
          { from: 'src/assets/fonts', to: 'fonts' },
          { from: 'src/ui/banner/de-anon-banner.css', to: 'ui/banner/' },
          // Copy the generated wasm-bindgen binary asset for runtime loading.
          {
            from: 'crate/pkg/privacy_guardrail_wasm_bg.wasm',
            to: 'wasm/[name][ext]',
            noErrorOnMissing: true,
          },
          ...getNerAssetCopyPatterns(__dirname, { includeNerModel: modelSource === 'bundled' }),
        ],
      }),

      // Popup HTML
      new HtmlWebpackPlugin({
        template: 'src/popup/popup.html',
        filename: 'popup/popup.html',
        chunks: ['popup/popup'],
      }),

      // Options page HTML
      new HtmlWebpackPlugin({
        template: 'src/options/options.html',
        filename: 'options/options.html',
        chunks: ['options/options'],
      }),

      // Side panel HTML
      new HtmlWebpackPlugin({
        template: 'src/sidepanel/sidepanel.html',
        filename: 'sidepanel/sidepanel.html',
        chunks: ['sidepanel/sidepanel'],
      }),

      // Offscreen HTML
      new HtmlWebpackPlugin({
        template: 'src/offscreen/offscreen.html',
        filename: 'offscreen/offscreen.html',
        chunks: ['offscreen/offscreen'],
      }),

      // Lightweight passive system-check offscreen HTML
      new HtmlWebpackPlugin({
        template: 'src/system-check/system-check-offscreen.html',
        filename: 'system-check/system-check-offscreen.html',
        chunks: ['system-check/system-check-offscreen'],
      }),
    ],

    // Chrome extensions require specific settings
    optimization: {
      splitChunks: false, // Don't split — each entry must be self-contained
    },

    devtool: 'cheap-module-source-map',

    experiments: {
      asyncWebAssembly: true,
    },
  };
};
