# Changelog

All notable changes to `n8n-nodes-loomcycle` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-22

Sub-phase 2.1 — first action node. The umbrella `LoomCycle` node with three resources and ~14 operations against a live loomcycle ≥ v0.9.2.

### Added

- **Action node:** `LoomCycle` (umbrella, op-discriminated).
- **Resource: Run** — 5 ops: Spawn (drains `runStreaming` to a structured result), Get Status (`getAgent`), Wait for Completion (client-side poll with configurable interval + timeout), Cancel (`cancelAgent`, cascades via `parent_agent_id`), List Agents (`listUserAgents` with optional status filter).
- **Resource: Memory** — 4 read ops: List Scopes, List Scope IDs, List Entries (with optional prefix + limit), Get Entry. Set/Delete/Search deferred pending adapter additions.
- **Resource: Channel** — 5 ops: Publish (with optional `deliver_at`), Subscribe (long-poll auto-ack), Peek (non-destructive), Ack (advance cursor), List Channels. All ops support `scope: global | user` with per-user `userId` parameter.
- **Helpers:** `getClient` (constructs `LoomcycleClient` from credential), `wrapLoomcycleError` (maps every typed adapter error to `NodeApiError` / `NodeOperationError` with bearer-fragment redaction), `buildSegments` (string → `PromptSegment[]`), `drainRunStream` (collects `AgentEvent` iterable into a structured `RunDrainResult`), `loadAgents` / `loadChannels` / `loadMemoryScopes` (dynamic dropdowns).
- **Tests:** 69 Vitest cases across runs / memory / channels / error-mapping. Covers parameter forwarding, credential default fall-through, typed-error mapping per adapter error class, bearer-redaction security regression.

### Notes for operators

- Long runs (`Spawn` operation) block the node's `execute()` until completion. Use the upcoming `LoomCycleRunCompleted` trigger (Sub-phase 2.3) for async patterns.
- Memory writes (Set / Delete / Search) are deferred. They will land when the adapter exposes typed methods (mirroring how Channel CRUD landed in loomcycle PR #180).
- The `loadAgents` dropdown returns agent names from runs visible to the credential's Default User ID. If that field is empty or no agents are visible, the dropdown falls back to manual entry.

### Internal

- Disabled two `eslint-plugin-n8n-nodes-base` rules whose autofixes are destructive (`node-param-display-name-miscased` mangles acronyms; `node-param-description-wrong-for-dynamic-options` duplicates instead of replacing). The underlying convention is honoured manually.

## [0.1.0] — 2026-05-22

Sub-phase 2.0 of the [implementation plan](docs/IMPLEMENTATION_PLAN.md). Scaffolding + credential only — no nodes yet.

### Added

- Repository scaffolding: `package.json`, `tsconfig.json` + `tsconfig.build.json`, ESLint config (n8n-nodes-base ruleset), Prettier config, Gulp icon-copy task, Vitest config.
- CI: GitHub Actions workflow running lint / typecheck / build / test on Node 20 + 22.
- Publish workflow (DRY-RUN ONLY through Sub-phase 2.5; activates fully at 2.6).
- `LoomCycleApi` credential type — bearer token + base URL + optional default user_id / user_tier / mcp_url; `/healthz` credential-test endpoint.
- Test harness: Vitest with shape assertions for the credential (no live network calls at this sub-phase).
