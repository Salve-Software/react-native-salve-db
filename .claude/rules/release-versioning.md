# Release & versioning (semantic-release, three published packages)

Three packages come out of this monorepo, but only two have their own release cycle:

- **root** (`@salve-software/react-native-salve-db`) — `release.config.cjs`, tags `v${version}`.
  Scoped, owned by the `salve-software` npm org from the first publish (org membership is what
  grants publish rights, not anything package-specific).
- **`packages/salve-db-studio`** (`@salve-software/salve-db-studio`) —
  `packages/salve-db-studio/release.config.cjs`, tags `salve-db-studio@${version}` (tag name is
  the logical/workspace name, decoupled from the published npm name on purpose — slashes in git
  tags are legal but needlessly odd). Also org-scoped, same reasoning as root.
- **`packages/salve-db-studio-launcher`** (published as bare `salve-db-studio`) — a ~10-line `npx`
  entry point, not part of the automated pipeline at all. See "The launcher package" below.

Root and the studio package share the type→bump table (`feat`=minor,
`fix`/`perf`/`refactor`/`docs`/`chore`=patch, breaking=major, revert=patch) defined once in
`release.rules.cjs` at the repo root.

## Auth: Trusted Publishing (OIDC), no NPM_TOKEN

Both jobs authenticate to npm via [Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
— no `NPM_TOKEN` secret exists or is needed. Mechanically: `id-token: write` on the job lets
`@semantic-release/npm`'s `verifyConditions` step exchange a GitHub Actions OIDC token for npm
registry trust during preflight (`lib/trusted-publishing/`), while the actual `npm publish` call
in `lib/publish.js` is a plain `execa("npm", ["publish", ...])` that relies on the **npm CLI's own**
OIDC auto-detection — hence the explicit `npm install -g npm@latest` step (Trusted Publishing needs
npm ≥ 11.5.1; don't rely on whatever ships with the pinned Node version). Provenance is automatic
under trusted publishing, no `NPM_CONFIG_PROVENANCE` flag needed.

This requires each package to have a Trusted Publisher configured on its npmjs.com settings page:
GitHub org `Salve-Software`, repo `react-native-salve-db`, workflow filename `release.yml` (exact,
case-sensitive, no path), allowed action `npm publish`. The bare-named launcher package is
published manually and was deliberately left out of this — it's not part of `release.yml`.

## The launcher package (`npx salve-db-studio`)

`npx <name>` resolves the argument as a literal, unscoped package name against the registry —
there's no such thing as an implicit scope lookup. A package named `@salve-software/salve-db-studio`
can only ever be run as `npx @salve-software/salve-db-studio` (or `npx -p @salve-software/salve-db-studio salve-db-studio`),
never as the bare `npx salve-db-studio` the CLI is meant to feel like.

`packages/salve-db-studio-launcher` closes that gap: it publishes under the bare name
`salve-db-studio`, its entire content is `bin.js` (`require('@salve-software/salve-db-studio')`)
plus a `"@salve-software/salve-db-studio": "*"` dependency. Because the dependency range is `*`,
npm/npx always resolves it to whatever is currently tagged `latest` — so the launcher does **not**
need to be republished when the real package releases. It has no `release.config.cjs` and is not a
job in `release.yml`; publish it once, manually, and only touch it again if the invocation contract
itself changes (e.g. renaming the bin).

This also resolves the ownership gap a bare package would otherwise have: since all the actual code
lives in the scoped, org-owned package, the launcher owning its own tiny bare name under a personal
account is low-stakes — there's nothing but a `require()` call to protect.

## Scope convention: `studio` / `studio-*`

**Any commit whose changes belong to `packages/salve-db-studio` must use a scope starting with
`studio`** (e.g. `studio`, `studio-ui`, `studio-server`) — this is what the root config uses to
exclude the commit from the core package's version, and what the studio config uses to include it
in its own. A commit without this prefix that touches the studio package will be treated as a core
change and won't version the studio package at all.

This is enforced by ordering, not by an enum: `@semantic-release/commit-analyzer` resolves a
commit's release type by letting the **last matching rule in array order win** (not the first).
Concretely:

- Root's `releaseRules` puts the `{ scope: 'studio*', release: false }` exclusion **last**, after
  the type rules, so it overrides them for a studio-scoped commit.
- Studio's `releaseRules` puts an unconditional `{ release: false }` **first**, so any later rule
  (all scoped to `studio*`) overrides it only for commits that actually touch the package.

**Known limitation:** a `BREAKING CHANGE` commit scoped to `studio*` still major-bumps the root
package. The unscoped `{ breaking: true, release: 'major' }` rule in root's config fires and, once
it resolves to `'major'` (the highest release type), commit-analyzer stops evaluating further rules
for that commit — the later exclusion rule never gets a chance to run. This can't be fixed by
reordering (root's breaking rule can't be scope-gated without also breaking unscoped commits, since
lodash's match requires an exact string comparison against `commit.scope`, which is `null` when no
scope is given). In practice this is rare and self-revealing: the spurious root major release's
generated notes will quote the studio-scoped breaking commit, making it obvious in review.

Validated empirically against the installed `@semantic-release/commit-analyzer` engine (not just
reasoned about) before relying on this design — see conversation history for the test cases if this
ever needs re-verifying after a `semantic-release` upgrade.
