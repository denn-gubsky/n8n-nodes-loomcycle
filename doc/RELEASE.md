# Release checklist

Internal procedure for cutting a new `n8n-nodes-loomcycle` release.

## Versioning

This package follows [semantic versioning](https://semver.org/). The minor version tracks the implementation plan's sub-phases (0.1 → 0.6 mapped to Sub-phases 2.0 → 2.5); `1.0.0` marks the first stable public release.

| Change type | Bump |
|---|---|
| Bug fix, internal cleanup | patch (`1.0.0` → `1.0.1`) |
| New node, new operation, new credential field | minor (`1.0.0` → `1.1.0`) |
| Removed / renamed node, credential breaking change, peer-dep major bump | major (`1.0.0` → `2.0.0`) |

The `@loomcycle/client` adapter tracks loomcycle's minor version. A loomcycle major release (`v1.0` → `v2.0`) will require a coordinated `n8n-nodes-loomcycle` major bump.

## Pre-release checklist

Run from a clean working tree:

1. **Sync `main`** — `git checkout main && git pull --prune origin main`
2. **Run all gates locally:**
   - `npm install`
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build` (verify all 7 node paths land in `dist/nodes/`)
3. **Update CHANGELOG** — move the unreleased entries under a new `## [X.Y.Z] — YYYY-MM-DD` heading. Include `### Added` / `### Changed` / `### Fixed` / `### Removed` sections as relevant.
4. **Update `package.json` `version`** to match the new heading.
5. **Update `package.json` `description`** if the sub-phase scope warrants it.
6. **Confirm `@loomcycle/client` pin** — if you upgraded for new features, document the minimum loomcycle version in the CHANGELOG.
7. **Live-loomcycle smoke** (when possible) — `LOOMCYCLE_BASE_URL=… LOOMCYCLE_AUTH_TOKEN=… npm test` against a real loomcycle to exercise the 4 wire-roundtrip cases.

## Cutting the release

```bash
git add CHANGELOG.md package.json
git commit -m "chore(release): vX.Y.Z"
git push origin main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

The `.github/workflows/publish.yml` workflow fires on the `v*.*.*` tag:

1. CI matrix passes
2. `npm publish --provenance --access public` — uses the `NPM_TOKEN` GitHub secret

Within ~30 seconds, `npm view @loomcycle/n8n-nodes-loomcycle version` should return the new version.

## Post-release

1. **Verify on npm** — `npm view @loomcycle/n8n-nodes-loomcycle versions --json | tail`
2. **Smoke-install** — fresh n8n container, install the package via the Community Nodes UI, drag a node onto a canvas, verify it loads
3. **Update GitHub release notes** — `gh release create vX.Y.Z --notes-file CHANGELOG.md` (or the relevant section)
4. **Announce** in:
   - GitHub Discussions (release thread)
   - Loomcycle's `_system/announcements` channel (if applicable to operators)
5. **Update n8n community-node directory** — only on stable / non-RC releases. PR against [`n8n-io/n8n-docs`](https://github.com/n8n-io/n8n-docs) adding/updating the entry in `docs/integrations/community-nodes/`.

## Rollback procedure

If a release introduces a regression:

1. **`npm unpublish` is gated** — npm only allows unpublish within 72 hours of publication, and only if no other packages depend on it. Generally avoid.
2. **Preferred:** ship a patch release (`vX.Y.Z+1`) that reverts the regression. Pin the rollback commit:

```bash
git revert <bad-commit>
git tag -a vX.Y.Z+1 -m "Rollback vX.Y.Z"
git push origin vX.Y.Z+1
```

3. **Add a deprecation note** to the bad version's CHANGELOG entry pointing operators at the patch.

## `1.0.0-rc1` soak (first stable release only)

Before tagging `v1.0.0`:

1. Cut `v1.0.0-rc1` — `npm publish --tag rc --provenance --access public`
2. Soak for 1 week against multiple operator deployments
3. Collect feedback in GitHub Discussions
4. Tag `v1.0.0` after the soak completes

This applies only to the first stable release; subsequent minor / patch releases ship directly.

## Coordinating with loomcycle / `@loomcycle/client`

Wire-API surface changes flow **loomcycle first → `@loomcycle/client` → here**. Never write n8n nodes against a wire op that hasn't shipped on the adapter.

When a release of this package depends on a new adapter method:

1. Confirm the adapter version is on npm: `npm view @loomcycle/client versions`
2. Bump `dependencies.@loomcycle/client` in `package.json`
3. Update the minimum-loomcycle table in `README.md` and `doc/SUPPORT.md`
