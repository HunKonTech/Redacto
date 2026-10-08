/** requests: generated from typeshed's stubs (bundled with pyright). */
module.exports = {
  id: 'requests',
  languages: ['python'],
  generate: 'requests',
  signals: [
    String.raw`^\s*import\s+requests\b`,
    String.raw`\brequests\.(?:get|post|put|patch|delete|head|options|request|Session)\s*\(`,
  ],
  namespaces: ['requests'],
  membersFrom: ['requests.*'],
  valueTypes: ['Response', 'Session'],
  kwargsFrom: ['requests.api', 'requests.sessions'],
};
