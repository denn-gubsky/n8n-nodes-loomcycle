# Changelog

All notable changes to `n8n-nodes-loomcycle` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-22

Sub-phase 2.0 of the [implementation plan](docs/IMPLEMENTATION_PLAN.md). Scaffolding + credential only — no nodes yet.

### Added

- Repository scaffolding: `package.json`, `tsconfig.json` + `tsconfig.build.json`, ESLint config (n8n-nodes-base ruleset), Prettier config, Gulp icon-copy task, Vitest config.
- CI: GitHub Actions workflow running lint / typecheck / build / test on Node 20 + 22.
- Publish workflow (DRY-RUN ONLY through Sub-phase 2.5; activates fully at 2.6).
- `LoomCycleApi` credential type — bearer token + base URL + optional default user_id / user_tier / mcp_url; `/healthz` credential-test endpoint.
- Test harness: Vitest with shape assertions for the credential (no live network calls at this sub-phase).
