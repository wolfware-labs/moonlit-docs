// Tags and GitHub releases only. The site image carries the version, so
// nothing is committed back to main.
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        // In this repo the docs are the product: a docs change has to ship, so it releases a patch.
        // The rules not listed keep their defaults (feat minor, fix and perf patch).
        releaseRules: [{ type: 'docs', release: 'patch' }],
      },
    ],
    '@semantic-release/release-notes-generator',
    ['@semantic-release/github', { successComment: false, failComment: false, releasedLabels: false }],
  ],
};
