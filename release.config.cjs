const { rules, sortMap } = require('./release.rules.cjs')

/**
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: ['main', { name: 'next', prerelease: 'next' }],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { breaking: true, release: 'major' },
          { revert: true, release: 'patch' },
        ]
          .concat(rules.map(({ type, release }) => ({ type, release })))
          // Commits scoped studio/studio-* (e.g. studio, studio-ui, studio-server) only
          // version packages/salve-db-studio (see its own release.config.cjs). This rule
          // must be LAST: @semantic-release/commit-analyzer resolves a single commit's
          // release type by letting the last matching rule in array order win, so putting
          // the exclusion after the type rules is what makes it override them for a
          // studio-scoped commit. KNOWN LIMITATION: this does not cover a studio-scoped
          // BREAKING CHANGE — the unscoped `breaking: true` rule above still fires and,
          // once it sets 'major', analysis stops before reaching this rule at all. A
          // breaking change confined to packages/salve-db-studio will therefore still
          // major-bump this package; it will be visible in the generated release notes
          // (referencing the studio-scoped commit) for manual review.
          .concat([{ scope: 'studio*', release: false }]),
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
        assets: ['package.json', 'CHANGELOG.md', 'example/package.json'],
      },
    ],
  ],
}
