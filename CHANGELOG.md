# Changelog

All notable changes to `n8n-nodes-loomcycle` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-05-23

Sub-phase 2.3 — trigger nodes. n8n workflows can now START from loomcycle events.

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
