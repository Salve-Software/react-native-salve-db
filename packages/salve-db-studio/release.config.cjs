const { rules, sortMap } = require('../../release.rules.cjs')

/**
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: ['main', { name: 'next', prerelease: 'next' }],
  tagFormat: 'salve-db-studio@${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          // Default-to-nothing, matched first: commit-analyzer resolves a single
          // commit's release type by letting the LAST matching rule in array order
          // win, so this unconditional { release: false } sets the baseline and every
          // rule below it (all scoped to studio/studio-*) overrides it only when the
          // commit actually touches this package. Without this, a commit with no scope
          // at all would fall through to the built-in Angular defaults (feat/fix/perf
          // matched by type alone) and bump this package for unrelated core changes.
          { release: false },
          { scope: 'studio*', breaking: true, release: 'major' },
          { scope: 'studio*', revert: true, release: 'patch' },
        ].concat(
          rules.map(({ type, release }) => ({
            type,
            scope: 'studio*',
            release,
          }))
        ),
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: rules.map(({ type, title }) => ({
            type,
            section: title,
          })),
        },
        writerOpts: {
          commitGroupsSort: (a, z) => sortMap[a.title] - sortMap[z.title],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    '@semantic-release/npm',
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
      },
    ],
  ],
}
