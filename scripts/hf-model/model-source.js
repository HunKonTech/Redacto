/**
 * Where the builds download the Local AI model from: the Hugging Face
 * repository and the revision (a commit SHA pins the model a release was
 * built with; `main` follows the repository). CI sets MODEL_HF_REPO and
 * MODEL_REVISION from the "Publish Local AI model to Hugging Face" step.
 *
 * The browser builds get it through webpack's DefinePlugin
 * (webpack.config.js); the IDE hosts read `model-source.json` next to the
 * panel (webpack.ide.config.js).
 */

const DEFAULT_MODEL_HF_REPO = 'koncsik/redacto-eu-pii-ner-q4f16';
const MODEL_MANIFEST_FILE = 'redacto-model.json';

function modelSource(env = process.env) {
  return {
    repo: env.MODEL_HF_REPO || DEFAULT_MODEL_HF_REPO,
    revision: env.MODEL_REVISION || 'main',
  };
}

/** The file the IDE hosts read (see ide/*: model download). */
function modelSourceJson(env = process.env) {
  const { repo, revision } = modelSource(env);
  return `${JSON.stringify({ format: 1, repo, revision, manifest: MODEL_MANIFEST_FILE }, null, 2)}\n`;
}

module.exports = { DEFAULT_MODEL_HF_REPO, MODEL_MANIFEST_FILE, modelSource, modelSourceJson };
