/**
 * Real-model tests that need a prepared model under `generated/models/` but
 * are committed (unlike the private `tests-local/` NER fixtures), so CI can
 * run them right after `prepare:model:*`. Kept out of the default Jest roots
 * because the model-free `validate:ci` run has no model to load.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests-model'],
  moduleFileExtensions: ['js'],
  testMatch: ['**/*.test.js'],
};
