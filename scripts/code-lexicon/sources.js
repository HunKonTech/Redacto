/**
 * Remote sources of the code lexicons: pinned URLs, verified by SHA-256 and
 * cached in `.cache/code-lexicon/` (gitignored). They are only read as data —
 * names are extracted from type stubs, reference assemblies, class files and
 * API listings; nothing downloaded is executed.
 *
 *   node scripts/build-code-lexicon.js --fetch    download what is missing
 *
 * npm sources (TypeScript lib, @types/*, the Angular/Vue/RxJS packages, and
 * pyright's bundled typeshed) come from `node_modules` instead.
 */

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'code-lexicon');

const nuget = (id, version, sha256) => ({
  id: `nuget:${id}`,
  url: `https://api.nuget.org/v3-flatcontainer/${id}/${version}/${id}.${version}.nupkg`,
  file: `${id}.${version}.nupkg`,
  version,
  sha256,
  license: 'MIT',
});

const maven = (group, artifact, version, license, sha256) => ({
  id: `maven:${artifact}`,
  url: `https://repo1.maven.org/maven2/${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`,
  file: `${artifact}-${version}.jar`,
  version,
  sha256,
  license,
});

const GO_VERSION = 'go1.27.1';
const GO_API_SHA256 = {
  'go1': 'd53d96327d8106e7e19ad840b25019563713606300c6b92a2a096d3b33ed7c6d',
  'go1.1': 'a69d3d332092060a53c36c7363503fedee7eff9d52342f97904099aceeccf797',
  'go1.2': 'f8d9e7f34504f251da890bbb61838acf9c79a371892eac95daac90aed4a75124',
  'go1.3': '19c9bcc9ef6bd248bea198b59d45204218a4942cfb19f67bca7498a9637aad33',
  'go1.4': 'e94199d42ca5f3321b4f7534af4d2ee1028896a38565b27518e5fb9d01f43230',
  'go1.5': '39fcd7ab9d3a63757d904f9975b744e5c16982fb164d19d3845f21d39bfbaaed',
  'go1.6': 'a492e25a9155cfe3df059cc699f9f6314f6a6e22eaec12aa535cfbdfc9bb37d9',
  'go1.7': '6719e909d4ac61ea04e7abf7e7d5f50b3b7c0bb3f5066428fcda7a73d6f874f8',
  'go1.8': 'e9930f308e6469433ee8e552b52d31aa5470461f3094d9b0d3b70013beaa5461',
  'go1.9': '097ccfb036aa3952841f10d75a8aa29e37b6a2ac332b84585ba81cb3bb92db03',
  'go1.10': '1308203a74f886322e11310f48485e452f8ebe76125d4e1bad24ed661ffe12c6',
  'go1.11': '79923702f5e6da01437531ac175d220708df6a91dc537868b42203dd43283cb2',
  'go1.12': 'db5d95e4888571a65f8067b42630268c94514f245deb4180c6a2070a7b27a618',
  'go1.13': '869de88033980773b8c27859e56c3398b71f1c1a215fc3c4f7bc157e31ebb682',
  'go1.14': '0d5ad70b5300b7d53460380a2940bc83d148ecd84810ea3b0fb9391ec23a3275',
  'go1.15': '2ecdd35c94b29b7c4fb2231e5156e636727cf163655f381587fc7280ee893cc0',
  'go1.16': 'e0deee658c3dea90d3c99687c5707b9419afe0fa06c2bc60ca60baed3e74f417',
  'go1.17': '7c44ac7ab381de31ea7fedf4a9814849b0a3bcbae1c825e56781223cf0747600',
  'go1.18': '5b42fcba4cd8882d2de580d9cc0ab6224ea331b19a631be71ac44763e16f4a34',
  'go1.19': 'c33ed06e37e065a638acdb4b9dd06b071899b53d4c7edce557b967bc9efa1af9',
  'go1.20': '7f52d0aea0dae3c79f46bd0d31e278434d1222176b2e517b7479297356856873',
  'go1.21': '829b857b8f45eebbe559b0a93f98d6a362f081f0ffcbc5471c4fbe7bcabb97ee',
  'go1.22': '98ace6a08a207a864d67c5a079f1d42e4849af27d70cff1ef7f913090dc0337c',
  'go1.23': '468b5cb8c5369892f2037d9284981924c144bfd7edc96a3aa344ef4f6707c8fa',
  'go1.24': '5d717afb14c44034ec8e6a3d12e1a1abd9786ad64aecf161b85ccad976c440dd',
  'go1.25': '8a0ef361fd1ad415078f440cbe155dc7a1c7e6a2ad83f97f93527f2c0530755d',
  'go1.26': '3b3fd1a5bfbc6b3ab3811dd4a0fb3930d29590c76d7203051a35e4b45360198b',
  'go1.27': 'd3315088c503102abea4323a13a9b74cd7e37b9fefe0d0d9ed4971fc54b671c4'
};
const GO_API_FILES = Object.keys(GO_API_SHA256);

const SOURCES = [
  nuget('microsoft.netcore.app.ref', '10.0.12', 'bf6e0a1fa7b5ce6a9bbfb7191d2c3151c2d6f812eafabee833fd000c1293b872'),
  nuget('microsoft.aspnetcore.app.ref', '10.0.12', 'b2cb6e55804cc8cc82ab750b07562866088f667994dbc09e9e46df6ee44aa060'),
  nuget('microsoft.entityframeworkcore', '10.0.12', '7e9f98370ce04178d704d1bc6a3b86bda1c254230f1e487e4fa666f2cb8323f5'),
  nuget('microsoft.entityframeworkcore.relational', '10.0.12', '993a89827edc7a0d36d3861e7e965af4f345717f02154841fc3f34ee087c5792'),
  nuget('microsoft.entityframeworkcore.sqlserver', '10.0.12', 'cd7c8bb1dbd15eea88a909625d0ad66e2def9dc073cc257438ff924312e0bfc0'),

  maven('org.springframework', 'spring-core', '7.0.9', 'Apache-2.0', '5195f4722699b39878d99a832549fe65df2890b159d063b88fff31b1ca65ae36'),
  maven('org.springframework', 'spring-beans', '7.0.9', 'Apache-2.0', 'ff218b827a25c9e8929b0cd56dfb56916cea9d5b669ed97dc7cb262508ff548b'),
  maven('org.springframework', 'spring-context', '7.0.9', 'Apache-2.0', '7552a2fcfa30cea53eb14d7a65a7a8e1b1dd82e832a7164fb7e6fb105f438858'),
  maven('org.springframework', 'spring-web', '7.0.9', 'Apache-2.0', '941ced476427bde2533872f293da535fd0258de3f3a650a7f1bfe01ed2927302'),
  maven('org.springframework', 'spring-webmvc', '7.0.9', 'Apache-2.0', '8f114c1461692c5e534e82b27de23b7fb23370db8dee7ce0c92d5106906c9555'),
  maven('org.springframework', 'spring-webflux', '7.0.9', 'Apache-2.0', '70ce35b3b507c2b5711daf78afccdb5d78142fdd3fc1ad0790257655bd6794da'),
  maven('org.springframework', 'spring-tx', '7.0.9', 'Apache-2.0', 'bfb15da6e096e2c0752e9db9987d2415bf0da1d744efc988535c10c6b6c2eedd'),
  maven('org.springframework', 'spring-jdbc', '7.0.9', 'Apache-2.0', 'ca0d9af1c5721eef8cac1f94c8b9d27a753248bc33c86e3472bd3d1dbd78f450'),
  maven('org.springframework', 'spring-test', '7.0.9', 'Apache-2.0', '6ce8fc116f5d309b9ac50a6738bd1b15ea4012a4a5563c0ee89b795bfc9af0dc'),
  maven('org.springframework.data', 'spring-data-commons', '4.1.1', 'Apache-2.0', 'cf2a3f9bfabefca1a8c2c0f0a65c393d9ff83b0cb1cf7b705accac18a6ed0ee4'),
  maven('org.springframework.data', 'spring-data-jpa', '4.1.1', 'Apache-2.0', 'e90191b8d9f1c5a9398db0587460f1f4002e0fe4ff267321ed3a107f7fec46e1'),
  maven('org.springframework.boot', 'spring-boot', '4.1.1', 'Apache-2.0', '0d92b532b1d4020640e72d78c31af175c23db8e0ddd45b81855b7fdf4c9c70f0'),
  maven('org.junit.jupiter', 'junit-jupiter-api', '6.1.3', 'EPL-2.0', '555d6cf20fa1710884dd01b86cc5785397ba73e21ada2d4b784f5f1a14dcafc4'),
  maven('org.junit.jupiter', 'junit-jupiter-params', '6.1.3', 'EPL-2.0', '05c51cedba2c06a9770707391e006cee825876937dea580b94a265ce145d4939'),
  maven('org.mockito', 'mockito-core', '5.24.0', 'MIT', '97a1f835ad84075255aa37809e4379eff541273c02c6201cbad49bd5950932cd'),
  maven('org.assertj', 'assertj-core', '3.27.7', 'Apache-2.0', 'c4a445426c3c2861666863b842cc4ec7bbb1c4226fefd370b6d2fe83d6c4ff0f'),
  maven('org.jetbrains.kotlin', 'kotlin-stdlib', '2.4.21', 'Apache-2.0', 'bd8250210584cb659847dce9cda660f8e9906e5def7fbebcea93dc6dcb6a88a3'),
  // GWT's JRE emulation: Apache-2.0 sources of java.lang/java.util/… (the JDK itself is GPL, not used).
  maven('org.gwtproject', 'gwt-user', '2.13.1', 'Apache-2.0', '35109b8c4eb2a72809b45c496e6b508c5d0e7229e8737ae7211b2097470cead4'),

  {
    id: 'pypi:pandas-stubs',
    url: 'https://files.pythonhosted.org/packages/9a/cb/5ad79e02a556cc23fed5816de0109fa8af660c66cfa5f4af74c3e8d4cd26/pandas_stubs-3.0.5.260914-py3-none-any.whl',
    file: 'pandas_stubs-3.0.5.260914-py3-none-any.whl',
    version: '3.0.5.260914',
    sha256: '39a1300c5c5c55fdf609e3476805decce5d5015539a4dcb683449f8feaeee2fb',
    license: 'BSD-3-Clause',
  },
  {
    id: 'pypi:django-stubs',
    url: 'https://files.pythonhosted.org/packages/96/36/206be00ba6aaf21c72cf61fd38cee492c7dcf51eac72fd61a9f7ddd0f916/django_stubs-6.1.2-py3-none-any.whl',
    file: 'django_stubs-6.1.2-py3-none-any.whl',
    version: '6.1.2',
    sha256: 'ffb6e74f54b8c1f9b2f3bc4852c5abbaa2324b2a7cb1c51854c5f95abe67165c',
    license: 'MIT',
  },
  {
    id: 'pypi:numpy',
    url: 'https://files.pythonhosted.org/packages/3a/1b/3b16a9bc514a440a7a0883684111dcb1ef1aee960af2ca95da8fc775f124/numpy-2.5.3-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl',
    file: 'numpy-2.5.3-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl',
    version: '2.5.3',
    sha256: 'a5fa86b80fd24bcd1aff83ad23be44ea323de3f787be8f8b15d4a65621e25321',
    license: 'BSD-3-Clause',
  },

  ...GO_API_FILES.map((name) => ({
    id: `go:${name}`,
    url: `https://raw.githubusercontent.com/golang/go/${GO_VERSION}/api/${name}.txt`,
    file: `go-api-${GO_VERSION}-${name}.txt`,
    version: GO_VERSION,
    sha256: GO_API_SHA256[name],
    license: 'BSD-3-Clause',
  })),
  {
    id: 'github:phpstorm-stubs',
    url: 'https://codeload.github.com/JetBrains/phpstorm-stubs/tar.gz/refs/tags/v2026.2',
    file: 'phpstorm-stubs-v2026.2.tar.gz',
    version: 'v2026.2',
    sha256: 'a1cceab2b91634fb64c076d85a0d7e58ada4d3ca7e47f165db1ccbdd07e8ef05',
    license: 'Apache-2.0',
  },
  {
    id: 'github:rbs',
    url: 'https://codeload.github.com/ruby/rbs/tar.gz/refs/tags/v4.2.0',
    file: 'rbs-v4.2.0.tar.gz',
    version: 'v4.2.0',
    sha256: '51829d743d169e7ece5740258462b6bf2c177948dad244aa8032ad70bd731e04',
    license: 'BSD-2-Clause',
  },
];

function sourceById(id) {
  const source = SOURCES.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown code lexicon source: ${id}`);
  return source;
}

function cachedPath(id) {
  return path.join(CACHE_DIR, sourceById(id).file);
}

function sha256Of(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Whether a source is in the cache with the pinned hash. */
function isCached(id) {
  const source = sourceById(id);
  const file = cachedPath(id);
  return fs.existsSync(file) && (!source.sha256 || sha256Of(file) === source.sha256);
}

function download(url, target, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'redacto-code-lexicon' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
          response.resume();
          resolve(download(new URL(response.headers.location, url).href, target, redirects - 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${url}: HTTP ${response.statusCode}`));
          return;
        }
        const out = fs.createWriteStream(target);
        response.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

/** Download every missing source; fail on a hash mismatch. Returns `{ id: sha256 }` for unpinned ones. */
async function fetchSources(ids = SOURCES.map((source) => source.id)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const unpinned = {};
  for (const id of ids) {
    const source = sourceById(id);
    const file = cachedPath(id);
    if (!isCached(id)) {
      const partial = `${file}.part`;
      process.stdout.write(`fetch ${source.url}\n`);
      await download(source.url, partial);
      fs.renameSync(partial, file);
    }
    const actual = sha256Of(file);
    if (source.sha256 && actual !== source.sha256) {
      fs.rmSync(file);
      throw new Error(`${id}: SHA-256 mismatch (expected ${source.sha256}, got ${actual})`);
    }
    if (!source.sha256) unpinned[id] = actual;
  }
  return unpinned;
}

module.exports = { CACHE_DIR, SOURCES, sourceById, cachedPath, isCached, fetchSources, sha256Of };

if (require.main === module) {
  fetchSources().then((unpinned) => {
    if (Object.keys(unpinned).length > 0) console.log(JSON.stringify(unpinned, null, 2));
  });
}
