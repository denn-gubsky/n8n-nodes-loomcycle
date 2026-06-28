# Changelog

All notable changes to `n8n-nodes-loomcycle` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.11.0] — 2026-06-28

**Minor release.** Two new substrate primitives from the loomcycle 1.x line — Filesystem Volumes (RFC AH) and the Path VFS (RFC AL). Phase 2 of the v1.4 catch-up. **20 → 22 nodes** (18 action + 3 trigger + 1 sub-node).

### Added

- **LoomCycle Volume node** (`volumeDef` + `listVolumes` + `listEphemeralVolumes`, RFC AH, loomcycle ≥ v1.1) — 6 ops:
  - **Create** — provision a dynamic volume with a name + **Mode** (ro / rw); the runtime derives the on-disk path inside its `dynamic_root` (callers never supply one).
  - **Get** — fetch a single volume by name.
  - **List** (`listVolumes`) — the persistent universe: the static (yaml) floor + the tenant's dynamic volumes, each badged by source + mode (host paths redacted for non-operator callers).
  - **List Ephemeral** (`listEphemeralVolumes`) — live run-scoped volumes (auto-purged when their run completes).
  - **Delete** — unmap a volume (keeps the files on disk).
  - **Purge** — destructive: unmap **and** remove the directory tree.
  - A `loadVolumes` dropdown backs Get / Delete / Purge.
- **LoomCycle Path node** (`path`, RFC AL, loomcycle ≥ v1.4) — 6 ops over the Unix-like VFS that names Memory entries / Volume mounts / Documents by path: **Resolve** / **List** (ls, with Recursive + Kind Filter) / **Stat** / **Make Directory** / **Move** / **Remove** (Recursive required for non-empty paths). A **Scope** selector (agent / user / tenant) is forwarded as a routing hint; the substrate resolves the authoritative tenant + subject from the bearer.

### Notable design decisions

- **Volumes are modelled flat, not versioned.** A `VolumeDef` points at mutable on-disk state, so there is no fork/promote/retire chain — the node exposes plain CRUD + the two list views, matching the adapter's op set.
- **Delete vs Purge are distinct ops** (not a flag) because the consequences differ sharply: Delete is reversible (files survive), Purge removes the tree. Surfacing them separately makes the destructive path explicit in the operation picker.
- **Path is a naming layer, not storage.** Resources opt into a name elsewhere (Memory.set, VolumeDef.create, Document.create_document); the Path node reads / reorganises that namespace. `mkdir` is exposed for parity though directories are implicit.

## [3.10.0] — 2026-06-28

**Minor release.** Interactive run steering (RFC AI) and the adapter bump to the loomcycle 1.x line. Phase 1 of the v1.4 catch-up. **Node count unchanged at 20** — these are new operations on the existing Run node. Pins `@loomcycle/client@^1.4.0`.

### Added

- **Run → Send Input op** (`sendRunInput`, loomcycle ≥ v1.1.1) — push an operator turn into a live interactive run parked at `end_turn`. Returns `{ run_id, delivered }`; `delivered: false` means no parked run accepted it (already finished, or steering disabled on the substrate).
- **Run → Spawn → Interactive Session field** (`RunOptions.interactive`, loomcycle ≥ v1.1.1) — start a persistent run that parks at `end_turn` for steering. The node returns as soon as the run parks (with its `run_id` and `awaitingInput: true`) instead of blocking for completion; drive it afterwards with **Send Input** and read final output via the **Run Completed** trigger or **Get Status**.

### Changed

- **`@loomcycle/client` pinned `^0.34.0 → ^1.4.0`.** loomcycle 1.5/1.6 added no new wire RPCs (config / UI only), so 1.4.0 captures the full buildable surface. The bundled adapter refreshes on build.

### Notable design decisions

- **Interactive spawns don't drain to completion.** An interactive run's stream stays open awaiting the next operator turn — a normal drain would block forever. The drain helper now breaks on the first `awaiting_input` frame (closing the SSE iterator while the run keeps running on the substrate), so the node returns the `run_id` for later steering.
- **`channelDef` and `register_agent`/`unregister_agent` deliberately not surfaced** — they exist as loomcycle MCP meta-tools but have no typed `@loomcycle/client` method yet (the iron rule: we only consume the adapter). Channels stay on the existing runtime CRUD; agent registration stays `agentDef({op:'create'})`.

## [3.9.0] — 2026-06-13

**Minor release.** Runtime snapshot backup / restore from n8n. Phase 5 (final) of the v0.34 catch-up. **19 → 20 nodes** (16 action + 3 trigger + 1 sub-node).

### Added

- **LoomCycle Snapshot node** (loomcycle ≥ v0.8.17) — 6 ops:
  - **Create** (`createSnapshot`) — label / include-history / max-bytes options.
  - **List** (`listSnapshots`) — limit + label-contains filters; a `loadSnapshots` dropdown backs the id-taking ops.
  - **Get** (`getSnapshot`) — full envelope incl. `json_content`.
  - **Restore** (`restoreSnapshot`) — from a stored snapshot ID **or** an inline envelope JSON (e.g. a Get output), with an optional interaction-history toggle.
  - **Delete** (`deleteSnapshot`) — idempotent.
  - **Export URL** (`exportSnapshotURL`) — synchronous; returns the bearer-authed download URL (no HTTP call).

### Notable design decisions

- **Restore offers a source toggle** (Snapshot ID vs Inline Envelope) so an envelope captured on another instance (or fetched via Get) can be restored directly, matching the adapter's `{snapshotId? | json?}` shape.
- **This completes the loomcycle v0.34 catch-up** (Phases 1–5): the package now covers run control + ensemble channels, human-in-the-loop, the LLM gateway, all eight definition families, and snapshot backup/restore.

## [3.8.0] — 2026-06-13

**Minor release.** Substrate-admin parity for two more definition families. Phase 4 of the v0.34 catch-up. **17 → 19 nodes** (15 action + 3 trigger + 1 sub-node).

### Added

- **LoomCycle Memory Backend node** (`memoryBackendDef`, RFC I, loomcycle ≥ v0.15) — 5 ops (Create / Fork / Get / List Versions / Retire) over pluggable memory backends (in-process or external REST store + ranker); the backend body rides the overlay JSON, same op-discriminated pattern as AgentDef.
- **LoomCycle Operator Token node** (`operatorTokenDef`, RFC L, loomcycle ≥ v0.17) — **Get / List / Retire only**.

### Notable design decisions

- **Operator Token deliberately omits `create` / `rotate`** (CLAUDE.md §6). The substrate returns the token plaintext once on mint/rotate; surfacing that here would persist a live bearer into n8n execution data. The node exposes only the non-secret lifecycle, shows an in-node notice directing mint/rotate to the loomcycle Web UI / CLI, and the executor refuses `create`/`rotate` defence-in-depth (so an injected op value can't reach the wire). A unit test locks the absence of those ops.

## [3.7.0] — 2026-06-13

**Minor release.** Direct LLM-gateway access (loomcycle ≥ v0.11) as a workflow step. Phase 3 of the v0.34 catch-up. **16 → 17 nodes** (13 action + 3 trigger + 1 sub-node).

### Added

- **LoomCycle LLM action node** (2 ops):
  - **Chat** (`llmChat`) — non-streaming completion through the gateway: build a message list (role + content rows), optional routing (`provider` / `model` / `tier`) + sampling (`max_tokens` / `temperature`) + per-user quota (`user_id` / `user_tier`, with credential fallback). Provider routing + auth + retry are handled substrate-side; no agent loop.
  - **Embeddings** (`embeddings`) — OpenAI-compatible vectors via the operator-configured embedder. One vector for the whole Input by default; a **Split Into Lines** toggle batches each non-empty line. Optional `encoding_format` / `dimensions` / `user`.

### Notable design decisions

- **Distinct from the Chat Model cluster sub-node.** The sub-node feeds an n8n AI Agent (LangChain-shaped, `supplyData`); this action node calls the gateway directly so RAG / embedding pipelines can get a completion or a vector as a plain workflow step. It's pure adapter calls — zero new dependencies, Cloud-safe.
- **Embeddings input defaults to a single text** (one vector); the Split-Into-Lines toggle is opt-in so a multi-line document isn't silently split per line.

## [3.6.0] — 2026-06-13

**Minor release.** Human-in-the-loop over loomcycle's `Interruption.ask` (loomcycle ≥ v0.8.16). Phase 2 of the v0.34 catch-up. **14 → 16 nodes** (12 action + 3 trigger + 1 sub-node).

### Added

- **LoomCycle Interruption action node** (3 ops): **List for User** (`listUserInterrupts`), **List for Run** (`listRunInterrupts`), **Resolve** (`resolveInterrupt` — posts a human's answer; validated against the ask's options when present).
- **LoomCycle: Interrupt Pending trigger** — polls `listUserInterrupts(status: 'pending')` for a user and emits each newly-seen ask (deduped by `interrupt_id` in workflow static data). Poll-based, no timers (Cloud-safe).
- **README `Human-in-the-loop` section** documenting the ask → human → resolve loop.

### Notable design decisions

- **The trigger + node form a closed loop** the way n8n excels at: the Interrupt Pending trigger surfaces an agent's question, a human answers it in n8n (Slack / email / form), and Interruption → Resolve unblocks the parked run. Requires loomcycle's consumer-MCP interruption backend to accept an external resolver.
- **Dedup keys off `interrupt_id`** (mirrors the Run Completed trigger's `agent_id` dedup), so an ask emits exactly once even though it stays `pending` across poll ticks until resolved.

## [3.5.0] — 2026-06-13

**Minor release.** Catches the package up to **loomcycle v0.34** (adapter `^0.21.0` → `^0.34.0`) by surfacing the ensemble + run-control surface that shipped across v0.25–v0.33. Phase 1 of a multi-phase catch-up — extends the existing Run + Channel nodes, no new node types.

### Added

- **`Run → Spawn Batch`** (`spawnRunBatch`, loomcycle ≥ v0.33) — fan-out up to 32 runs concurrently from one node; the node blocks until all settle and returns an index-aligned envelope (per-child failures reported in-envelope, never thrown).
- **`Run → Compact`** (`compactRun`, ≥ v0.33) — summarise a parked run's conversation to reclaim context; reports before/after token counts + applied status (live / marker / no-op).
- **`Run → Get Transcript`** (`getTranscript`) — read a session's full event log (system prompt + every turn).
- **`Run → Spawn` Additional Fields: Sampling (JSON)** (`RunOptions.sampling`, ≥ v0.28), **Compaction (JSON)** (`RunOptions.compaction`, ≥ v0.32), **Run Timeout (Seconds)** (`RunOptions.runTimeoutSeconds`, ≥ v0.21) — per-run overrides; each inherits the agent's value when unset.
- **`Channel → Await`** (`awaitChannels`, ≥ v0.25) — fan-in: wait until a predicate (any / all / at-least-N) is met across a set of channels; non-committing.
- **`Channel → Broadcast`** (`broadcastChannels`, ≥ v0.25) — fan-out: publish the same payload to multiple channels atomically.
- **`Channel → Purge`** (`purgeChannel`, ≥ v0.11.5) — clear a channel's buffered messages while keeping its definition + cursors; allowed on yaml channels too.

### Changed

- **Adapter pin bump:** `@loomcycle/client` `^0.21.0` → `^0.34.0`.

### Notable design decisions

- **Sampling / Compaction are JSON-object fields** folded via the shared `parseObjectField` helper (operator-authored JSON; the adapter + substrate validate the shapes), and omitted from the wire when empty — existing Spawn payloads stay byte-identical.
- **Await / Broadcast take a comma-separated channel set** (max 32) distinct from the single-channel message ops, with a shared scope + scope_id; **Purge reuses the `loadChannels` dropdown** (not the runtime-only `channelName`) because it is valid on yaml channels.

## [3.4.0] — 2026-06-02

**Minor release.** Surfaces loomcycle **v0.21** non-secret **metadata channel** — structured context delivered to the agent (a code-js agent reads `input.metadata`; an LLM agent gets a trusted prompt block). Adapter pinned `^0.21.0`.

### Added

- **`Run → Spawn`: a Metadata (JSON) field** (under Additional Fields) → `RunOptions.metadata`. Per-call, trusted, not inherited by continuations.
- **`Schedule → Create` / `Fork`: a Metadata (JSON) field** → `overlay.metadata`. Static, delivered on every fire; override per fork (e.g. a distinct `repo` per tenant).
- **`Webhook → Create` / `Fork`: a Metadata (JSON) field** → `overlay.metadata` (static, **trusted**). Request-sourced metadata is wired via `payload_mapping` `run_metadata.<name>` targets in the Advanced Overlay (projected from the inbound body, delivered **untrusted** + fenced) — documented in the field hints.
- **`Webhook → Create` / `Fork`: Per-Delivery Credentials** (template strings → `overlay.user_credentials`), reaching parity with the Schedule node's per-fire credentials (loomcycle v0.21 WebhookDef creds parity).

### Changed

- **Adapter pin bump:** `@loomcycle/client` `^0.20.0` → `^0.21.0` — consumes `RunOptions.metadata` / `ContinueOptions.metadata`.

### Notable design decisions

- **Metadata is a JSON-object field, not a name/value collection.** loomcycle types it as `Record<string, unknown>` (values may be nested/numbers), so a JSON field is the faithful surface — unlike the credentials maps, whose values are always template strings.
- **Empty `{}` is omitted from the wire**, so existing Run/Schedule/Webhook payloads are byte-identical when the field is untouched. A shared `parseObjectField` helper strict-parses (malformed JSON → clear node error) and drops empty/non-object input.
- **Static vs request-sourced webhook metadata stay distinct.** Static `metadata` is operator-authored and trusted; `run_metadata.*` payload-mapping targets are attacker-influenceable and delivered untrusted — the node keeps the trusted field structured and leaves the untrusted mapping to the Advanced Overlay, mirroring loomcycle's own split.

## [3.3.0] — 2026-06-02

**Minor release.** Surfaces loomcycle **v0.20** MCP dynamic-ingestion behaviour on the MCP Server node. Pairs with the code-js inline work in 3.2.0; both bump the adapter to `^0.20.0`.

### Added

- **`MCP Server → Register` / `Fork`: a "Discover Tools at Registration" toggle** (default on). loomcycle ≥ v0.20 runs the `tools/list` handshake at ingestion and returns a `discovered` count in the node output (best-effort — an unreachable peer still registers and self-heals). Folded to the wire as `discover` only when turned off, so existing Register payloads are unchanged.

### Changed

- **Adapter pin bump:** `@loomcycle/client` `^0.14.1` → `^0.20.0`.
- **Field hints updated for v0.20 create-time behaviour:** the URL host is now allowlist-checked *at registration* (loopback/RFC1918 hosts need the private host allowlist); inner `${LOOMCYCLE_*}` header tokens are *expanded at registration*, so the env vars must exist on the deployment before Register; content-addressed re-registration is a no-op (`deduplicated: true`).

### Notable design decisions

- **`discover` is only sent when turned off.** True is the server default, so omitting it keeps the wire payload byte-identical to pre-v0.20 for the common case and avoids perturbing existing workflows.
- **No `Ensure` operation.** The substrate already dedups create by `content_sha256`, so re-running Register is effectively idempotent; the explicit op-discriminated surface (8 ops) stays uniform rather than adding a parallel `ensureMcpServer` path.
## [3.2.0] — 2026-06-02

**Minor release.** Inline authoring for loomcycle **code-js** agents (RFC J — deterministic JavaScript agents) on the existing Agent Definition node. code-js is a synthetic *provider*, so it rides the existing `agentDef()` + Run lifecycle — no new node.

### Added

- **`Agent Definition → Create` / `Fork`: a Provider dropdown.** Anthropic / Code-JS / DeepSeek / OpenAI / Google Gemini / Ollama, plus a "Set via Overlay JSON" default that preserves the prior behaviour. The selected provider is folded into the definition overlay as `provider` and overrides any `provider` key set in the Overlay JSON.
- **Inline JavaScript Code editor for code-js.** When **Code-JS** is selected, a `jsEditor` field appears; its source is folded into the overlay as `code_body` (loomcycle ≥ v0.20 — inline ingestion, no host filesystem bind). loomcycle compiles + content-hashes the code at registration. Empty editor ⇒ loomcycle falls back to the host `agent_code/<name>/index.js` path (inline wins when both are present). A gate notice reminds operators that the host needs `LOOMCYCLE_CODE_AGENTS_ENABLED=1` and that source is capped at ~256 KB.
- **README `Code-JS agents` section** documenting inline authoring + the filesystem fallback.

### Changed

- **Adapter pin bump:** `@loomcycle/client` `^0.14.1` → `^0.20.0` — consumes the typed `AgentDefOverlay.code_body` surface (v0.19/0.20) and brings the bundled adapter current with v0.17 multi-tenant auth. All previously-consumed methods unchanged.

### Notable design decisions

- **Inline `code_body`, not a filesystem deploy reminder.** loomcycle v0.20 (commit `1c896c2`) added inline `code_body` ingestion via AgentDef — reversing the earlier filesystem-only constraint — so the node now ships a real JS editor. `jsEditor` (not `codeNodeEditor`) is used deliberately: it omits n8n's `$json`/`$input` autocomplete, which would mislead for loomcycle-runtime JS.
- **`code_body` is only folded when the provider is `code-js`**, so a stale value in the editor can't leak onto an LLM agent definition.

## [1.2.0] — 2026-05-25

**Minor release.** Closes the long-standing memory-writes gap + adds runtime channel admin CRUD. Both surfaces consume `@loomcycle/client@^0.11.5`'s newly-typed `setMemoryEntry` / `deleteMemoryEntry` / `createChannel` / `updateChannel` / `deleteChannel` methods.

### Added

- **`Memory → Set Entry` action-node operation** (`client.setMemoryEntry`). Idempotent JSON-value upsert by `(scope, scope_id, key)`. Optional `embed=true` triggers a synchronous embedding via the operator-configured embedder (response reports whether the embedding actually landed). Optional `ttlSeconds` for time-bounded entries.
- **`Memory → Delete Entry` action-node operation** (`client.deleteMemoryEntry`). Idempotent — deleting a missing row is a non-error.
- **`Channel → Create Channel` action-node operation** (`client.createChannel`). Creates a runtime-substrate channel with operator-configurable scope / semantic / TTL / max-messages / publisher / period. Yaml-declared channels refuse with HTTP 409 (`channel_yaml_immutable`).
- **`Channel → Update Channel` action-node operation** (`client.updateChannel`). Partial update: only the fields you set are touched. Yaml channels refuse.
- **`Channel → Delete Channel` action-node operation** (`client.deleteChannel`). Cascades messages + cursors. Yaml channels refuse.
- **`LoomCycle Memory Tool` cluster sub-node** now exposes `setEntry` + `deleteEntry` ops in its Zod schema. **This is the strategic addition**: AI Agents can now write to memory mid-reasoning, unlocking stateful agentic workflows (cache across reasoning turns, persist across runs). The default tool description grew from *"Read loomcycle Memory entries"* to *"Read or write loomcycle Memory entries"*.

### Changed

- **Adapter pin bump:** `@loomcycle/client` `^0.11.4` → `^0.11.5`. v0.11.5 added the 5 new methods consumed here. All existing methods unchanged.
- **`Memory` resource ops** went from 4 (read-only) → 6 (full CRUD).
- **`Channel` resource ops** went from 5 → 8.
- **README + `doc/SUPPORT.md`** updated to reflect the new ops and version compatibility.

### Notable design decisions

- **Channel admin CRUD is NOT exposed on the cluster `LoomCycle Channel Tool` sub-node.** Channel lifecycle is operator concern, not AI Agent concern. The tool sub-node keeps its publish + peek ops as agent-callable surfaces; create / update / delete stay on the action node where operators wire them deliberately.
- **The strict-JSON parse from publish payload also applies to memory `setEntry` value field.** A non-JSON string would otherwise land server-side opaquely; the strict parse throws early with the operator-facing `Invalid JSON: ...` error.
- **n8n-nodes-base lint rule alignment.** The Update Channel param was renamed `Update Settings` → `Update Fields` per `node-param-display-name-wrong-for-update-fields`. Create Channel settings collection alphabetised per `node-param-collection-type-unsorted-items`.

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 240 passing + 4 skipped (was 229 + 4; +11 new cases covering memory CRUD writes, channel admin CRUD, and the cluster Memory Tool's new write surface)
- `npm run build` produces all 8 node paths

## [1.1.4] — 2026-05-24

Patch release. **Defence-in-depth fix for `messages[*].tool_call_id` gateway rejection** — adds synthetic tool-call id generation at every wire boundary where the id could be empty.

### Background

v1.1.3 attempted to fix this via `_getType()`-based message detection + simplified streaming tool-call emission. The error persisted on the operator's TrueNAS deployment, which led to a deeper investigation of LangChain's tool-call reconstruction logic.

### Root cause (confirmed)

LangChain's `AIMessageChunk` constructor (`@langchain/core/messages/ai.js:178`) explicitly rejects tool calls with empty/missing `id`:

```javascript
if (!id || parsedArgs === null || ...) {
    throw new Error("Malformed tool call chunk args.");
}
// → tool call goes into invalid_tool_calls, NOT tool_calls
```

When the empty-id tool call lands in `invalid_tool_calls`, the AI Agent's Tools Agent still runs the tool but creates a `ToolMessage` with empty `tool_call_id`. That message then flows into our gateway request and trips the substrate-side validator with `messages[*].tool_call_id: tool message requires tool_call_id`.

Why did the id arrive empty? Could be a substrate-side gateway behaviour (we couldn't observe the wire from this side), or a LangChain accumulation edge case. Either way, our package can defend against both.

### Fixed

- **Synthetic id generation at every wire boundary.** New helpers `generateToolCallId()` + `ensureNonEmptyToolCallId()` in `langchainChatModel.ts`. Applied at:
  - **Streaming `content_block_start`** (`_streamResponseChunks`): if the gateway-emitted `id` is empty, substitute a synthetic `tool_<hex>` id. Logs a warning via `console.warn` so operators see the path is firing.
  - **Non-streaming `chatResponseToAIMessage`** (`_generate`): same defensive substitution on the tool_use content blocks of the response.
  - **`langchainToLoomcycleMessage` tool-message conversion**: last-line-of-defence — if a `ToolMessage` somehow reaches us with empty `tool_call_id`, substitute a synthetic id to avoid the gateway-reject path. The round-trip won't correlate cleanly in that pathological case but the request will succeed (preferable to a hard failure).

### Internal

- Helpers exported as `__generateToolCallIdForTests` + `__ensureNonEmptyToolCallIdForTests` for direct unit coverage.
- 4 new test cases (synthetic-id format, pass-through behaviour, empty-input fallback, ToolMessage empty-id substitution). Total: **229 passing + 4 skipped** (was 225 + 4).

### Diagnostic notes

The `console.warn` lines fire ONLY when the defensive substitution kicks in. If operators see them in n8n's logs, that's a signal something upstream is emitting empty ids — file a substrate-side issue against loomcycle so we can pin down whether it's a gateway emit issue or an accumulation edge case.

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 229 passing + 4 skipped
- `npm run build` produces all 8 node paths

## [1.1.3] — 2026-05-24

Patch release. **Fixes `messages[*].tool_call_id: tool message requires tool_call_id` gateway error** during AI Agent tool-loop turns, plus tightens streaming tool-call emission and clarifies operator-facing parameter descriptions.

### Fixed

- **Message-type detection now uses `_getType()` instead of `instanceof`.** The previous `instanceof ToolMessage` / `HumanMessage` / etc. checks failed when LangChain messages crossed n8n's worker-thread / IPC boundary — the prototype chain breaks on the receiving side. Misclassified messages fell through to the catch-all `'user'` branch OR (worse) routed as `'tool'` with an empty `tool_call_id`, causing the gateway to reject the request mid-conversation with the cited error. The fix: detect via `BaseMessage._getType()` (a method on the prototype that returns a stable string tag like `'tool'` / `'human'` / `'ai'`), with a defensive shape-inspection fallback (presence of `tool_call_id` ⇒ `'tool'`, presence of `tool_calls` ⇒ `'ai'`) for the edge case where the prototype chain is completely lost.
- **Streaming tool-call emission simplified.** Previously emitted both `tool_call_chunks` AND `tool_calls` on the same `content_block_stop` chunk. LangChain's `AIMessageChunk.concat()` accumulation could double-process this combination and corrupt the resulting tool-call `id` field — which then propagated downstream as the empty `tool_call_id` that hit the gateway-reject path. Now emits only `tool_call_chunks` with `type: 'tool_call_chunk'`; LangChain reconstructs the final `tool_calls` cleanly from the chunks.

### Changed

- **`LoomCycle Chat Model` parameter descriptions rewritten** for operator clarity:
  - `Provider` / `Model`: no longer suggests `"anthropic / openai / deepseek / ollama"` as if it's a closed list. Descriptions now explain that values come from the operator's loomcycle.yaml resolver config; the examples are just common conventions.
  - `Tier` / `User Tier`: removed the misleading `default / pro / free` placeholder. Loomcycle tiers are operator-defined in yaml (could be `internal`, `premium`, `research`, anything). Description updated to reflect that.
  - All routing-hint descriptions clarify that the canonical values depend on operator deployment, not a fixed enum in this package.

### Internal

- Exported `langchainToLoomcycleMessage` as `__langchainToLoomcycleMessageForTests` so unit tests can directly exercise the conversion function on IPC-degraded message shapes (LangChain's `invoke()` validates inputs upstream of our conversion, blocking the test path through the model). 4 new direct-conversion test cases cover: intact-prototype ToolMessage, `_getType()`-present plain object, fully-prototype-lost shape-only object, and AIMessage `tool_calls` round-trip via shape inspection.

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 225 passing + 4 skipped (was 221 + 4; +4 conversion-helper coverage cases)
- `npm run build` produces all 8 node paths

## [1.1.2] — 2026-05-24

Patch release. **Fixes `this.bind is not a function` runtime error** in n8n AI Agent when wiring `LoomCycle Chat Model` + any tool.

### Fixed

- **`LoomcycleChatModel.bindTools` now constructs `RunnableBinding` directly** instead of calling `this.bind({...})`. The 1.1.1 release wired up `bindTools` per the standard LangChain pattern (`return this.bind({ tools, ...kwargs })`), but at runtime inside n8n's AI Agent invocation flow, `this.bind` resolved to undefined and the workflow failed with:

  > Problem in node 'AI Agent': this.bind is not a function

  The new implementation matches exactly what `Runnable.bind()` does internally (per `@langchain/core/runnables/base.js`): `new RunnableBinding({ bound: this, kwargs, config: {} })`. Sidesteps the problematic `this.bind` lookup entirely. Same runtime tool-translation path as before — tools land on `options.tools` for every subsequent invoke/stream call, and our existing `extractToolsFromOptions` normalises them to the gateway's `LLMTool` shape.

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 221 passing + 4 skipped (same as 1.1.1)
- `npm run build` produces all 8 node paths

## [1.1.1] — 2026-05-24

Patch release. **Fixes the `Tools Agent requires Chat Model which supports Tools calling` error** when wiring `LoomCycle Chat Model` into an AI Agent that has tools in its Tool slot.

### Fixed

- **`LoomcycleChatModel.bindTools` now explicitly implemented.** LangChain's `BaseChatModel.bindTools` is declared as optional (`bindTools?`) — subclasses opt into tool-calling support by providing an override. n8n's Tools Agent checks `typeof model.bindTools === 'function'` to detect tool-calling capability and refused to wire the workflow when the method was missing from our instance (1.1.0). The override forwards bound tools through `this.bind({ tools })` so they land on `options.tools` for every subsequent invoke/stream call — same conversion path our existing `extractToolsFromOptions` already handled at call time. No change to the runtime tool-translation logic; the fix is purely a capability advertisement.

### Internal

- 2 new test cases in `test/nodes/cluster/chatModel.test.ts` — one asserts `typeof model.bindTools === 'function'` (matching n8n's check), one verifies pre-bound tools propagate through to `client.llmChat`'s `options.tools`. Total: **221 passing + 4 skipped** (was 219 + 4).

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 221 passing + 4 skipped
- `npm run build` produces all 8 node paths

## [1.1.0] — 2026-05-24

**Minor release.** Adds the long-awaited fifth cluster sub-node: **`LoomCycle Chat Model`**, which plugs into n8n's AI Agent's Chat Model slot and routes the agent's LLM calls through loomcycle's gateway (`POST /v1/_llm/chat`, substrate v0.10.x+, adapter `@loomcycle/client@^0.11.0`). Consumes the LLM Gateway endpoint that landed upstream in loomcycle following the cross-repo RFC.

### Added

- **`LoomCycle Chat Model`** cluster sub-node. Plugs into n8n's AI Agent's **Chat Model** slot (`outputs: [NodeConnectionTypes.AiLanguageModel]`). Exposes loomcycle's provider routing, auth substitution, retry, host allowlist, and per-user quota policy via a single n8n credential — replacing per-provider Chat Model nodes (Anthropic / OpenAI / Gemini / etc.) with a single routing-aware gateway shim.
- **`nodes/_shared/langchainChatModel.ts`** — `LoomcycleChatModel` class extending LangChain's `BaseChatModel`. Implements both `_generate` (non-streaming via `client.llmChat`) and `_streamResponseChunks` (token-streaming via `client.llmStream`). Honours LangChain `bindTools` — tools passed via the AI Agent's options arrive on every call and are translated to the gateway's provider-agnostic `LLMTool` shape (substrate-side handles per-provider translation: Anthropic `input_schema` / OpenAI `function.parameters` / Gemini `function_declarations`).
- **Node parameters:** Provider, Model, Tier, User ID, User Tier, Max Tokens, Temperature, Streaming. All routing hints are optional — empty values fall through to credential defaults or the resolver's automatic pick.
- **`doc-internal/llm-gateway-request.md`** — the RFC document sent to the loomcycle team that drove the upstream `POST /v1/_llm/chat` design. Preserved here for historical reference.

### Changed

- **Adapter pin bump:** `@loomcycle/client` `^0.10.3` → `^0.11.0`. v0.11.0 adds the typed `llmChat()` + `llmStream()` methods wrapping the gateway endpoint. All existing methods (Channel CRUD / MCPServerDef / streamUserRunStates / etc.) remain unchanged.

### What loomcycle provides via the new sub-node

| Feature | How |
|---|---|
| **Single credential** | One `LoomCycle API` bearer; all provider auth lives in loomcycle's env. n8n no longer needs per-provider credentials. |
| **Provider routing** | Loomcycle's resolver picks the provider / model at request time based on tier policy + availability + fallback rules. |
| **Per-user quotas** | `userId` field feeds loomcycle's per-user quota policy — useful for multi-tenant n8n deployments. |
| **Single audit log** | All LLM calls audit into loomcycle's `/v1/_events` log; no need to stitch logs across multiple provider dashboards. |
| **Tool calling** | Provider-agnostic tool definitions translated to each provider's native format substrate-side. n8n AI Agent's Tools Agent mode works unchanged. |

### Out of scope (still tracked upstream)

The 1.1.0 release ships against the v0.10.x gateway endpoint's v1 surface. Items deferred upstream (and therefore not yet available via this sub-node):

- `stop_sequences` parameter (deferred until loomcycle's providers package exposes the equivalent)
- `user_bearer` template substitution (deferred until the gateway grows an MCP path)
- Multi-modal content (image inputs) — text-only conversations in v1
- `tool_choice` field (defaults to provider's `auto`)
- Embedding endpoint (separate RFC pending)

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 219 passing + 4 skipped (was 210 + 4; added 9 new cases covering the LangChain wrapper + sub-node fixture)
- `npm run build` produces all 8 node paths

## [1.0.5] — 2026-05-24

Patch release. **Hygiene + docs + CI bump.** No wire-API changes; no operator workflow changes required.

### Fixed

- **`LoomCycle: Run Completed` trigger — editor test mode now honours the `Transport` setting.** When the operator clicks `Execute step` on the trigger node in the editor and `Transport: SSE (Push)` is selected, the manual path subscribes to `client.streamUserRunStates` for ~30s and emits the first live event — instead of falling back to `pollOnce` (which returned historical snapshot data because `workflowStaticData` doesn't persist between editor test runs). Polling mode still uses `pollOnce` (matches the "show me what would currently match" test-mode semantics). Production / published mode is unchanged — `runSseLoop` / `runPollLoop` continue to drive the persistent path.

### Added

- **`runSseListenOnce`** in `nodes/LoomCycleRunCompleted/helpers/sse.ts` — single-shot SSE subscriber with timeout. Emits the first matching event then returns; swallows close/open meta-frames; resolves cleanly on timeout abort.
- **`README.md` — "Verified deployments" subsection** documenting the TrueNAS n8n `2.22.1` / direct-IP / sub-20 ms SSE round-trip validation from the 1.0.4 smoke test.
- **`doc/SUPPORT.md` — Verified deployments table** + version compatibility rows for 1.0.1 through 1.0.5.

### Changed

- **GitHub Actions versions bumped:** `actions/checkout@v4` → `@v5`, `actions/setup-node@v4` → `@v5`, across `ci.yml` / `publish.yml` / `integration.yml`. Silences the Node 20 deprecation warning that started appearing on every workflow run after June 2026.
- **README adapter pin documentation** updated to reflect `^0.10.3` (was `^0.9.2` in the README; the package itself had been on `^0.10.x` since 1.0.1).
- **README n8n compatibility** notes the Tools Agent / dual-mode-cluster-sub-node story (introduced in 1.0.4).

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 210 passing + 4 skipped (was 207 + 4; added 3 new `runSseListenOnce` cases)
- `npm run build` produces all 7 node paths

## [1.0.4] — 2026-05-24

Patch release. **Fixes cluster sub-nodes on n8n's current Tools Agent (v1.82+)**: each of the 4 sub-nodes (Memory / Channel / Sub-Agent / MCP Server Tool) now implements both `supplyData()` (legacy LangChain-direct AI Agent modes) AND `execute()` (current Tools Agent mode), so they work across n8n versions.

### Fixed

- **`Problem in node 'LoomCycle Memory Tool': has a "supplyData" method but no "execute" method`** — and the same error for the other three cluster sub-nodes when wired into n8n's AI Agent in v1.82+. Root cause: n8n migrated its default AI Agent from older modes (OpenAI Functions Agent, Conversational Agent) that consume tools via LangChain's `DynamicStructuredTool.func` to the **Tools Agent** which invokes connected tools by calling their `execute()` directly through n8n's regular node-execution pipeline. We shipped only the `supplyData()` path; under Tools Agent the LLM's tool-call args land in `getInputData()` and n8n expects an `execute()` to consume them.
- **Dual-mode tool nodes.** Each cluster sub-node now exposes both paths:
  - `supplyData()` returns a LangChain `DynamicStructuredTool` for older agent modes (unchanged behaviour).
  - `execute()` reads the LLM's tool-call args via `getInputData()`, validates them against the same Zod schema, runs the same operation, and returns the result as `INodeExecutionData[][]` for Tools Agent consumption.
- **Shared logic, no duplication.** Each cluster sub-node extracts its operation body into a module-level helper (`runMemoryOp`, `runChannelOp`, `runSubAgentOp`, `runMcpServerOp`) that both `supplyData()` and `execute()` call. The MCP Server Tool's idempotent ensure-on-spawn (`mcpServerDef get→create`) runs once per `supplyData()` or `execute()` invocation just like before.

### Added

- **`executeToolFn` helper** in `nodes/_shared/clusterTool.ts` — sibling of `buildTool`. Handles the Tools Agent execute() plumbing: input parsing, Zod validation, error wrapping with bearer redaction (CLAUDE.md §security.6), result envelope shaping into `INodeExecutionData[][]`.

### Internal

- New test fixtures `makeExecuteContext` + `invokeExecute` in `test/nodes/cluster/_helpers.ts` mirror the existing `makeSupplyDataContext` + `invokeSupplyData`.
- 5 new test cases (one execute() test per cluster sub-node + a bearer-redaction case on the new path). Total: **207 passing + 4 skipped** (was 202 + 4).

### Known limitations (still tracked; not blocking)

- `manualTriggerFunction` on `LoomCycle: Run Completed` still calls `pollOnce` regardless of `Transport` setting in editor test mode. Production (published) mode honours the setting correctly. Polish patch deferred.
- `cleanupOnEnd` on the MCP Server Tool is honoured only via `supplyData()`'s `closeFunction`. Tools Agent's `execute()` path has no workflow-end lifecycle hook; operators wanting retire-on-execute should call `MCPServerDef → retire` via the umbrella action node.

### Verified

- `npm run lint` clean
- `npm run typecheck` clean
- `npm test` — 207 passing + 4 skipped
- `npm run build` produces all 7 node paths

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
