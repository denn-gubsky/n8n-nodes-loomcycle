# Changelog

All notable changes to `n8n-nodes-loomcycle` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] — 2026-05-24

Patch release. **Real fix for the `Spawn → Agent` dropdown**: now populated from the loomcycle agent library (yaml-static + dynamically-registered AgentDefs), not from per-user run history.

### Fixed

- **`loadAgents` now calls `client.listLibraryAgents()`** instead of `client.listUserAgents(userId)`. The library endpoint (`GET /v1/_library/agents`, shipped in loomcycle v0.9.3) merges yaml-declared agents and dynamic AgentDef registrations into one source-tagged envelope. Brand-new yaml agents that have never spawned now appear in the dropdown; dynamic-only registrations appear too.
- **Each dropdown option carries a source-tag description** (yaml-static / dynamic AgentDef / yaml + dynamic) plus version metadata (`vN · N versions`). Operators can tell at a glance which definition is yaml-baseline vs. AgentDef-evolved.
- **Operator-scoped lookup, no userId required.** The library endpoint is bearer-authed at operator-trust scope; the dropdown no longer depends on the credential's optional Default User ID setting.

### Changed

- **Adapter pin bump:** `@loomcycle/client` `^0.10.1` → `^0.10.3`. v0.10.3 is an adapter-only release ([loomcycle PR — adapter-only release](https://github.com/denn-gubsky/loomcycle)) that adds typed wrappers for the three Library v2 endpoints (`listLibraryAgents`, `listLibrarySkills`, `listLibraryMcpServers`). All three become available to future dropdowns; only `listLibraryAgents` is wired up in this release.
- **Spawn field description rewritten** to reflect the new behaviour — points operators at the merged library and explains the source-tag descriptions.

### Internal

- `test/nodes/LoomCycle/loadOptions.test.ts` — replaced the `listUserAgents` mock with `listLibraryAgents`; added test cases for source-tag formatting, alphabetical sort, empty-library placeholder, and operator-scoped lookup (no userId requirement).
- The previously-closed PR #11 (honest-UX patch that kept the misleading wire call) is superseded by this PR. Library v2 turned out to be available since loomcycle v0.9.3 — the adapter wrapper was the only missing piece, and that's what v0.10.3 ships.

### Future work tracked (not in this release)

`listLibrarySkills` and `listLibraryMcpServers` are now available on the adapter but not yet wired to any dropdown. Candidates for future use:
- `LoomCycle → Skill Definition → List` / `Get` / `Promote` / `Retire` ops — their `name` parameter could populate from `listLibrarySkills`.
- `LoomCycle → MCP Server Definition → Get` / `Rediscover` / `Retire` ops — same pattern via `listLibraryMcpServers`.
- The `LoomCycleMcpServerTool` cluster sub-node's parent-canvas sniffer could fall back to the library list when no explicit MCP-Client-Tool sibling is found.

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 202 passing + 4 skipped (added 2 cases covering source-tag rendering + operator-scoped lookup)
- `npm run build` produces all 7 node paths

## [1.0.2] — 2026-05-23

Patch release. **Fixes node-picker visibility on n8n 2.x** (reported as: package loads cleanly, all 7 nodes register, Community Nodes panel shows green check, but `LoomCycle`, `LoomCycle: Run Completed`, and `LoomCycle: Channel Message` don't appear when searched in the workflow canvas's general node-picker / trigger-picker).

### Fixed

- **Removed `"categories": ["AI"]` from the codex registration of the 3 user-facing nodes**: the umbrella `LoomCycle` action node, `LoomCycle: Run Completed` trigger, and `LoomCycle: Channel Message` trigger. n8n 2.x treats codex `categories: ["AI"]` as a strong filter that scopes a node to AI-Agent contexts only; combined with `group: ['transform']` / `group: ['trigger']` it produced a contradiction that hid these nodes from the regular workflow node-picker entirely. The 4 cluster sub-nodes (Memory Tool / Channel Tool / Sub-Agent Tool / MCP Server Tool) keep their AI category — they legitimately belong there (their `outputs: [NodeConnectionTypes.AiTool]` already restricts them to AI Agent tool slots).

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` 200 passing + 4 skipped (no test changes; codex JSONs aren't covered by the test surface)
- `npm run build` produces all 7 node paths
- Codex JSON sanity: 3 user-facing nodes have no `categories` field; 4 cluster sub-nodes retain `categories: ["AI"]`

## [1.0.1] — 2026-05-23

Patch release. **Fixes install on n8n's CommonJS community-node loader** (reported on self-hosted n8n / TrueNAS as: `No "exports" main defined in @loomcycle/client/package.json`).

### Fixed

- **CJS interop with `@loomcycle/client`**. Bumped pin from `^0.9.2` → `^0.10.1`. The adapter v0.10.1 ships as a dual ESM + CommonJS distribution ([loomcycle PR #196](https://github.com/denn-gubsky/loomcycle/pull/196)) — n8n's `require()`-based loader now resolves it cleanly. ESM consumers continue to use the same import path; this is strictly additive on the adapter side.

### Internal

- `nodes/_shared/clusterTool.ts` — narrowed-then-widened the schema generic to break `@langchain/core@0.3.80`'s `DynamicStructuredTool<T>` recursion (TS2589 "Type instantiation is excessively deep"). Runtime behaviour unchanged; covered by the 26 cluster-sub-node test cases.
- `.eslintrc.js` — registered the `@typescript-eslint` plugin (parser was already configured; just needed the plugin name registered so `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments resolve).
- Tarball size: 96.6 kB / 99 files (was 62 kB pre-bump — increase from the fresh `@langchain/core@0.3.80` peer dep being slightly heavier in dev-tree resolution; published tarball still excludes peer deps).

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` 200 passing + 4 skipped (same surface as 1.0.0)
- `npm run build` produces all 7 node paths
- `npm pack --dry-run` packs cleanly

## [1.0.0] — 2026-05-23

**First stable release.** Sub-phase 2.6 of [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). All of Phase 2 (Sub-phases 2.0 through 2.5) is now bundled under one stable major version + this package is ready for the n8n community-node directory.

### Pre-publish: renamed to scoped `@loomcycle/n8n-nodes-loomcycle`

Before first npm publish, the package was renamed from the original unscoped `n8n-nodes-loomcycle` to the scoped `@loomcycle/n8n-nodes-loomcycle`. The scoped name groups the package alongside [`@loomcycle/client`](https://www.npmjs.com/package/@loomcycle/client) under the same `@loomcycle` npm organisation — same maintainer, same trust boundary, easier multi-maintainer publish access. **No operator migration needed** — the unscoped name was never published.

Codex registration in every `*.node.json` updated accordingly (`"node": "@loomcycle/n8n-nodes-loomcycle.<nodeId>"`). The example workflow JSONs in `examples/` use the new `type: "@loomcycle/n8n-nodes-loomcycle.*"` prefix. The schema-validation test now reads the package name from `package.json` instead of hard-coding the prefix, so future renames (if any) only touch one file.

This supersedes the RFC's original unscoped lock; the locking rationale changed mid-development (recognised that `@loomcycle/*` org cohesion + multi-maintainer org-publish ergonomics outweigh the slightly-longer install name).

### What's in 1.0.0

The cumulative shape from the 6 sub-phases:

- **1 credential** — `LoomCycle API` (bearer + base URL + optional defaults; `/healthz` test)
- **1 umbrella action node** — `LoomCycle` with 6 resource groups and ~40 operations (Run / Memory / Channel / AgentDef / SkillDef / MCPServerDef + Context-shape ops where adapter-available)
- **2 trigger nodes** — `LoomCycle: Run Completed` (SSE primary, polling fallback) and `LoomCycle: Channel Message` (long-poll subscribe with at-most-once + at-least-once delivery modes)
- **4 cluster sub-nodes** — Memory / Channel / Sub-Agent / **MCP Server Tool** (the strategic differentiator)
- **6 example workflow JSONs** under `examples/` covering the canonical composition patterns

### Sub-phase 2.6 deliverables

- **Operator-facing `README.md`** — comprehensive install / configure / node-reference / examples / troubleshooting / MCP env-var-mirror / version-compatibility-matrix guide. Replaces the 2.0 stub.
- **`doc/RELEASE.md`** — internal tag/publish/announce checklist. Documents the `1.0.0-rc1` soak procedure.
- **`doc/SUPPORT.md`** — version compatibility matrix + breaking-change policy + how to file issues + security-disclosure path.
- **`.github/workflows/publish.yml`** — wired to fire on `v*.*.*` tags with `npm publish --provenance --access public`. `workflow_dispatch` defaults to dry-run; flip the `dry_run` input to `false` to publish via manual trigger.
- **`.github/workflows/integration.yml`** — daily-cron live-loomcycle smoke matrix (uses `LOOMCYCLE_BASE_URL` + `LOOMCYCLE_AUTH_TOKEN` GitHub secrets; auto-skips when unset).

### Cumulative stats

| Metric | Value |
|---|---|
| Files | 70 source + 18 test |
| Lines of TypeScript | ~6,500 (excluding tests + JSON) |
| Lines of JSON examples | ~750 |
| Vitest cases | **200 passing + 4 skipped** |
| Min loomcycle | v0.9.2 |
| Min n8n | 1.82.0 |
| Min Node.js | 20.15 |

### Migration from 0.x

This is the first stable release; no migration needed. Operators on the `0.x` interim releases (0.1.0 — 0.6.0) can upgrade directly to `1.0.0` — no breaking changes were introduced in the 1.0 release itself; the version bump signals API stability.

### Acknowledgements

The locked design across all 6 sub-phases tracks the operator's [RFC `n8n-comparison.md`](https://github.com/denn-gubsky/loomcycle-internal/blob/main/doc-internal/rfcs/n8n-comparison.md) and the [MCPServerDef cross-repo plan](doc-internal/mcp-server-def-cross-repo.md) — both authored before this package's code existed.

## [0.6.0] — 2026-05-23

Sub-phase 2.5 — **example workflows**. Six importable n8n workflows demonstrating canonical composition patterns, plus a live-loomcycle smoke test + helper scripts.

### Added

- **`examples/01-multi-agent-research.json`** — researcher → summariser → channel-published digest.
- **`examples/02-slack-loomcycle-slack.json`** — Slack trigger → loomcycle agent (per-channel session) → Slack reply.
- **`examples/03-daily-activity-report.json`** — Cron → `listAgents` (parallel completed + failed) → JS aggregation → email. Uses `listAgents` instead of the deferred `Evaluation` tool.
- **`examples/04-n8n-as-loomcycle-tool.json`** — Vector 2 RFC pattern: n8n workflow exposed as an MCP server consumed by loomcycle agents.
- **`examples/05-ai-agent-with-loomcycle-memory.json`** — n8n AI Agent + `LoomCycleMemoryTool` + `LoomCycleSubAgentTool` cluster sub-nodes.
- **`examples/06-dynamic-mcp-provisioning.json`** — **crown jewel** — `LoomCycleMcpServerTool` provisioning Slack MCP into the loomcycle substrate dynamically.
- **`examples/README.md`** — per-example narrative + prerequisites + import instructions.
- **`scripts/import-examples.sh`** — helper to bulk-import via `n8n import:workflow`.
- **`scripts/start-loomcycle.sh`** — local helper for spinning up the loomcycle binary.
- **`test/examples/workflowSchema.test.ts`** — 37 Vitest cases per-workflow: shape validation + connection-reference integrity + cross-reference against `package.json` `n8n.nodes[]` (catches drift if a node type is renamed/deleted without updating the examples).
- **`test/integration/live-loomcycle.test.ts`** — 4 smoke tests against a running loomcycle (health, listChannels, listMemoryScopes, mcpServerDef list). Auto-skips when `LOOMCYCLE_BASE_URL` is unset; ships green in standard CI.

### Out of scope (deferred to Sub-phase 2.6)

- The daily-cron CI workflow that spins up loomcycle + n8n containers and runs the example workflows end-to-end. Infrastructure-heavy; the schema-validation tests + the smoke matrix here cover the wire-API surface. The container-cron lands alongside the npm publish + community-node directory submission.

### Notes for operators

- All example JSONs use placeholder credential IDs (`loomcycle-creds`, `slack-creds`, etc.). After import, click each LoomCycle node and (re)select your actual credential.
- Example #06 requires loomcycle ≥ v0.9.2 (PR #177 `MCPServerDef` substrate) AND the `LOOMCYCLE_SLACK_TOKEN` env var on the loomcycle side. The n8n side carries only the template string `${LOOMCYCLE_SLACK_TOKEN}` — plaintext credentials never traverse the wire.

## [0.5.0] — 2026-05-23

Sub-phase 2.4 — **cluster sub-nodes**. n8n's AI Agent can now reach into loomcycle through 4 new tools.

### Added

- **`LoomCycle Memory Tool`** — discriminated tool exposing the 4 Memory read ops (listScopes / listScopeIDs / listEntries / getEntry). The agent calls it with `{op, scope?, scopeID?, key?, prefix?, limit?}`.
- **`LoomCycle Channel Tool`** — exposes Channel `publish` + `peek` ops with `scope: global|user`. Subscribe stays a trigger; Ack stays the action node.
- **`LoomCycle Sub-Agent Tool`** — delegates the parent AI Agent's tool-call to a configured loomcycle agent via `runStreaming`, returns the drained `finalText`. Defaults `treatPromptAsUntrusted: true` (the prompt comes from a model).
- **`LoomCycle MCP Server Tool` — strategic differentiator.** On `supplyData`: refuses stdio transport → idempotent ensure (`get` then `create` on `NotFoundError`) → returns a tool that, when invoked, spawns the configured loomcycle agent with `allowed_tools: ['mcp__<name>__*']`. **`cleanupOnEnd: false` default** (locked design); opt-in retire-on-workflow-end via `closeFunction`. Env-var hints (`${LOOMCYCLE_*}` tokens in headers) logged for operator visibility.
- **`nodes/_shared/clusterTool.ts`** — `buildTool({name, description, schema, fn})` helper. Wraps `DynamicStructuredTool` from `@langchain/core/tools`. Errors thrown inside the tool's `fn` are caught, redacted (CLAUDE.md §security.6), and returned as `{error: "..."}` JSON strings so the parent agent reads the failure mode without leaking bearer fragments into its context.
- **+ tests** — 26 new Vitest cases (`memoryTool`, `channelTool`, `subAgentTool`, `mcpServerTool`). Total: **162 / 16 files**.

### Dependencies

- `@langchain/core` (peer + dev) — LangChain's `DynamicStructuredTool` is the canonical n8n AI Agent tool contract.
- `zod` (peer + dev) — input-schema validation on the tool callbacks.

n8n provides both at runtime; we peer-depend so we don't ship duplicate copies.

### Notes for operators

- Each cluster sub-node carries a `Tool Name` parameter; this must be **unique across sibling sub-nodes** under the same AI Agent.
- The MCP Server Tool's `cleanupOnEnd: false` default means an MCP registration survives workflow re-executions. Flip the toggle if you want per-execution-scoped registrations (e.g. for ephemeral teams).
- Memory writes (set/delete/search) remain deferred until `@loomcycle/client` exposes admin write endpoints — consistent with the 2.1 / 2.2 deferral pattern (no one-shot-agent workarounds).

## [0.4.0] — 2026-05-23

Sub-phase 2.3 — trigger nodes. n8n workflows can now START from loomcycle events. Also includes the **full code-review fix-up** for sub-phases 2.0–2.3 (9 review findings addressed in the same commit set; see "Code-review fixes" below).

### Added

- **`LoomCycle: Run Completed`** trigger — fires when an agent run reaches a terminal state (completed / failed / cancelled). Two transports:
  - **SSE (default)** — persistent `streamUserRunStates` consumer with transparent reconnect on the substrate's 30-min server cap. `parentAgentId` filter + `debug` toggle forwarded; opt-in `Surface Stream Open/Close Events` parameter surfaces the synthetic `stream_close` meta-frames as `__meta: 'stream_close'` rows.
  - **Polling fallback** — periodic `listUserAgents` calls with `workflowStaticData`-backed dedup. Use when the deployment can't sustain long-lived SSE (Cloudflare workers, naive nginx with `proxy_buffering on`, etc.).
- **`LoomCycle: Channel Message`** trigger — fires per new message on a watched channel. Direct `subscribeChannel` long-poll (v0.9.2 Channel CRUD, PR #180). Two delivery modes:
  - **Auto-ack (default)** — substrate auto-commits the cursor on a non-empty batch (at-most-once).
  - **Peek + Explicit Ack** — `peekChannel` + emit + `ackChannel` after; cursor persisted in `workflowStaticData` (at-least-once, survives workflow crashes mid-processing).
- **`nodes/LoomCycle/helpers/staticData.ts`** — typed wrappers for `getWorkflowStaticData('node')` (seen-set + cursor with bounded retention).
- **Tests:** +18 Vitest cases across 3 new test files (sse + poll + subscribe), totalling 127 / 11 files.

### Notes for operators

- Both triggers honour the credential's `Default User ID` when the per-node parameter is empty.
- Both triggers implement `manualTriggerFunction` so the n8n editor's "Listen for Test Event" button does a single one-shot listen.
- The SSE trigger's reconnect backoff is exponential (capped at 4×). After 5 consecutive failures the loop gives up.

### Code-review fixes (applied 2026-05-23)

Full independent code review against sub-phases 2.0–2.3 surfaced 4 High + 1 Medium + 4 Low findings; all addressed:

- **H1 — Bearer redaction in loadOptions fallback messages.** All three `loadOptions` methods now run the error string through `redactBearerFragments` before placing it in the dropdown's instructional placeholder. Closes a potential editor-UI leak path. Regression-tested.
- **H2 — `ChannelCursorRegressionError` mapping.** Added a branch in `wrapLoomcycleError` mapping the 409 `channel_cursor_regression` typed error to a clear "Re-fetch the channel's committed cursor and retry" `NodeApiError`. Regression-tested.
- **H3 — SSE loop `emitError` semantics.** Previously fired `emitError` on every reconnect attempt (1–4) and silently returned on attempt 5. Now suppresses errors during transient retries (normal for SSE — 30-min server cap, reverse-proxy drops, etc.) and fires `emitError` ONCE on the terminal give-up so n8n's trigger lifecycle deactivates instead of going silently deaf.
- **H4 — `drainRunStream` unbounded memory.** Dropped the `events: AgentEvent[]` field from `RunDrainResult`. Long-running agent runs were inflating n8n's execution-record storage with thousands of frames. Downstream consumers wanting per-event visibility should use the RunCompleted trigger.
- **M5 — Peek-ack loop bounded retry.** ChannelMessage trigger now gives up after 5 consecutive failures (e.g. permanent `ChannelCursorRegressionError`) instead of spinning forever at the backoff interval.
- **L2 — Dead test fixtures removed.** `createMockClient()` + `MockClient` type removed from `_helpers.ts`; replaced with a comment explaining WHY each test file inlines its own `mockClient` (vi.mock hoisting).
- **L3 — Unnecessary cast in `sse.ts`.** Removed `RunStateEvent` import + `as RunStateEvent['status'][]` cast — `statuses` is already typed `string[]` in `StreamUserRunStatesOptions`.
- **L6 — Added SSE reconnect-after-clean-close test.** Guards against regressions of the `attempt = 0` counter reset that allows the loop to recover from transient drops without crossing into terminal give-up.
- **L7 — Strict JSON parsing for Channel Publish payload.** `parseJsonField` gains an opt-in `strict: true` mode that throws `NodeOperationError` on invalid JSON instead of silently forwarding the raw string. Wired on the publish path.

Test count: 109 → 136 (+27 new across 2.3 itself and the review additions). All gates remain clean (lint, typecheck, build).

## [0.3.0] — 2026-05-23

Sub-phase 2.2 — substrate-admin resources. The umbrella `LoomCycle` node gains three new resources for versioned-definition management.

### Added

- **Resource: Agent Definition** — 7 ops (Create, Fork, Get, List Versions, Promote, Retire, Verify). Maps to `client.agentDef({op, ...})`. Supports overlay-diff JSON for Create/Fork, `content_sha256` round-trip for Verify.
- **Resource: Skill Definition** — 7 ops (same shape as AgentDef). Maps to `client.skillDef`.
- **Resource: MCP Server Definition** — 8 ops (Fork, Get, List Versions, Promote, Rediscover, Register, Retire, Verify). Maps to `client.mcpServerDef`. Register UI uses structured `transport` + `URL` + `headers` fields (stdio transport rejected with `NodeOperationError` — yaml-only). Headers support `${LOOMCYCLE_*}` substitution; the UI surfaces a "Required env vars on the loomcycle deployment" notice. Substrate live as of loomcycle v0.9.2 (PR #177).
- **Helpers:** `capability.ts` (`requireLoomcycleVersion` + `parseSemver` + `semverGte` for forward-compat gating against future-feature additions) + `envVarHints.ts` (`extractEnvVarNames` / `extractEnvVarsFromHeaders` / `formatEnvVarHint` for the MCPServerDef Register UI hint).
- **Tests:** +40 Vitest cases (12 AgentDef / 9 MCPServerDef / 19 capability+envVarHints), totalling 109 across 8 files.

### Deferred (consistent with 2.1's Memory-write decision)

- **Resource: Evaluation** — substrate has an in-band tool with submit/get/list_for_run/list_for_def/aggregate ops, but no admin endpoint. Lands when `@loomcycle/client` adds `evaluation()` analogous to `agentDef()`.
- **Resource: Context** — same situation. Help / Self / Lineage / History are agent-internal; no admin surface.

### Notes for operators

- MCPServerDef Register defaults `promote: true` (typical "register and use" intent). Other Create / Fork ops default `promote: false` (caller explicitly Promotes after review).
- The Headers fixed-collection accepts template strings; the n8n node never transmits plaintext credentials — only `${LOOMCYCLE_FOO}` references.

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
