# n8n-nodes-loomcycle — Phase 2 implementation plan

## Context

`n8n-nodes-loomcycle` is a brand-new community npm package (the repo at `/Users/denn/work/n8n-nodes-loomcycle/` is empty: `LICENSE` + `.gitignore` + `CLAUDE.md` + `doc-internal/`). It is **Tier B / Phase 2** of the RFC `~/work/loomcycle-internal/doc-internal/rfcs/n8n-comparison.md` (locked 2026-05-19). The package realises the strategic pairing: **n8n as the agentic-architecting/management UI; loomcycle as the agentic OS/substrate** — composing via `@loomcycle/client` v0.9.2 (the typed HTTP+SSE adapter that ships **36 methods** covering every wire op we need: `mcpServerDef`, Channel CRUD (`publishChannel`/`subscribeChannel`/`peekChannel`/`ackChannel`, admin `scope=global` + per-user `scope=user`), and `streamUserRunStates` with `parentAgentId` filter + `debug` toggle).

Phase 0 (substrate endpoints `GET /v1/_channels` + `GET /v1/users/{user_id}/agents/stream`) and Phase 1 (`Context.help` topic `n8n-integration`) already shipped in loomcycle v0.9.x. This plan covers Phase 2's 7 sub-phases — scaffolding through community-directory submission — and the dynamic-MCP-server-provisioning feature locked 2026-05-22 (operator-admin-only, `cleanupOnEnd: false` default). **All upstream prerequisites are live in loomcycle v0.9.2**: PR #173 (n8n Phase 0 wire-API), PR #174 (Phase 1 docs), PR #175 (content_sha256), PR #177 (MCPServerDef substrate), PR #180 (Channel CRUD wire-API), PR #181 (`parentAgentId` + `debug` ts-adapter polish).

Outcome: a published `n8n-nodes-loomcycle` npm package listed in n8n's community-node directory, exposing 7 resource groups (Run / Memory / Channel / AgentDef / Evaluation / Context / MCPServerDef) as an umbrella action node, 2 trigger nodes (Run Completed, Channel Message), 5 cluster sub-nodes (Memory / Channel / Sub-Agent / Context-Help / **MCP Server Tool**), and 6 example workflows.

## Upstream readiness (refresh — 2026-05-22 post-loomcycle-v0.9.2)

| Upstream dependency | Status | Loomcycle PR | Resolves |
|---|---|---|---|
| `GET /v1/_channels` listing endpoint | **Shipped v0.9.x** | #173 | Phase 0 (n8n channel dropdowns) |
| `GET /v1/users/{user_id}/agents/stream` SSE | **Shipped v0.9.x** | #173 | Phase 0 (RunCompleted trigger transport) |
| `Context.help` topic `n8n-integration` | **Shipped v0.9.x** | #174 | Phase 1 docs |
| `AgentDef` + `SkillDef` content_sha256 + verify | **Shipped v0.9.x** | #175 | AgentDef/SkillDef Verify ops in Sub-phase 2.2 |
| **MCPServerDef substrate end-to-end** | **Shipped v0.9.2** | **#177** | Sub-phase 2.2 + 2.4 MCPServerDef ops + cluster sub-node |
| **Channel CRUD wire-API** (publish/subscribe/peek/ack, admin + per-user scope) | **Shipped v0.9.2** | **#180** | Sub-phase 2.1 Channel ops + Sub-phase 2.3 ChannelMessage trigger |
| **TS adapter `parentAgentId` filter + `debug` toggle** on `streamUserRunStates` (also `runStreaming` debug) | **Shipped v0.9.2** | **#181** | Sub-phase 2.3 RunCompleted trigger (filter + reconnect surfacing) |
| `@loomcycle/client` npm version | **0.9.2** | #183 | n8n package pin baseline |

**Net effect:** every "Open question to loomcycle functionality" flagged in the original plan is now resolved upstream. The n8n package has a single supported substrate floor — **loomcycle v0.9.2** — and ships with no upstream-pending gates. Capability-gate code paths remain for forward-compat but are no longer load-bearing.

## Summary at a glance

| Sub-phase | Output | Critical adapter calls | npm version |
|---|---|---|---|
| 2.0 — Scaffolding + Credential | builds-clean, lint-clean, CI-green; `LoomCycleApi` credential with `/healthz` test | `health` | 0.1.0 |
| 2.1 — Action nodes (Run, Memory, Channel) | Umbrella `LoomCycle` node with 3 resources, ~17 ops | `runStreaming`, `getAgent`, `cancelAgent`, `listUserAgents`, `listMemoryEntries`+, `listChannels`, `publishChannel`, `subscribeChannel`, `peekChannel`, `ackChannel` | 0.2.0 |
| 2.2 — Action nodes (AgentDef, Evaluation, Context, MCPServerDef) | 4 more resources, ~23 more ops; full MCPServerDef end-to-end | `agentDef`, `skillDef`, `mcpServerDef`, `health` | 0.3.0 |
| 2.3 — Trigger nodes | `LoomCycleRunCompleted` (SSE+poll, `parentAgentId` filter, `debug` meta-frames) + `LoomCycleChannelMessage` (direct long-poll `subscribeChannel`) | `streamUserRunStates`, `listUserAgents`, `subscribeChannel` | 0.4.0 |
| 2.4 — Cluster sub-nodes | 5 sub-nodes pluggable into n8n's AI Agent; **`LoomCycleMcpServerTool` is the strategic differentiator** | `mcpServerDef` (idempotent ensure), `runStreaming`, `getMemoryEntry`, `publishChannel`/`subscribeChannel` | 0.5.0 |
| 2.5 — Examples + integration tests | 6 importable workflow JSONs; CI matrix vs live loomcycle | all of the above | 0.6.0 |
| 2.6 — Docs + publish + directory submission | npm publish + n8n community-node directory listing | (re-runs prior) | 1.0.0 |

**Critical path:** 2.0 → 2.1 → 2.2 → 2.4 → 2.6. 2.3 (triggers) can branch off 2.0 in parallel. 2.5 (examples) can be drafted alongside 2.4. Total estimate: ~6–8 weeks single-engineer; ~4–5 weeks two-engineer.

## Locked design constraints (read CLAUDE.md for full text)

1. **`@loomcycle/client` is the only wire-egress point.** No hand-rolled fetch. Adapter v0.9.2 ships `mcpServerDef` (line 618), Channel CRUD `publishChannel`/`subscribeChannel`/`peekChannel`/`ackChannel` (lines 752/773/791/807), and `streamUserRunStates` with `parentAgentId` + `debug` (line 841). Pin `^0.9.2`.
2. **Umbrella action node.** Single `LoomCycle` node with `resource` + `operation` enums (n8n-canonical SDK-driven pattern). Programmatic `execute()` because adapter-driven, not raw HTTP. RFC-fixed.
3. **MCPServerDef is operator-admin-only.** Bearer-authed; no per-agent escalation. HTTP + Streamable-HTTP only (n8n nodes reject stdio with typed `NodeOperationError`). Substrate-side `POST /v1/_mcpserverdef` is live as of loomcycle v0.9.2 (PR #177) — fully end-to-end functional.
4. **`LoomCycleMcpServerTool.cleanupOnEnd: false` default.** Persistent across workflow executions so multiple agentic teams share stable registrations; ephemeral teams opt in.
5. **Capability gating via wire errors.** Substrate-readiness checks now only matter for forward-compat against future-feature additions and for the rare case of an operator running pre-v0.9.2 loomcycle. Surface `NodeApiError("Requires loomcycle vX.Y")` only when a wire op returns a "not implemented" / unknown-endpoint error — no client-side version probing beyond `health()`.
6. **Credential boundary.** `LoomCycleApi` credential's `bearerToken` is opaque inside node code. Never log, never include in `NodeApiError.description`. `wrapLoomcycleError` strips header-shaped substrings from `bodyText`.
7. **Errors map adapter → n8n.** Every typed adapter error (`LoomcycleError`, `AuthError`, `NotFoundError`, `SubstrateToolRefusedError`, etc.) goes through one `wrapLoomcycleError(err, node)` helper.
8. **Substrate stance.** Composition only; no n8n features inside loomcycle, no loomcycle yaml editing inside n8n.

## Sub-phase 2.0 — Scaffolding + Credential

**Goal:** boots-clean repo with a working `LoomCycleApi` credential. `npm link` into local n8n + green "Test" checkmark. No nodes yet — `nodes/.gitkeep` only.

**Files to create:**

| Path | Purpose | LOC |
|---|---|---|
| `package.json` | `"keywords": ["n8n-community-node-package"]`, `peerDependencies: { "n8n-workflow": ">=1.82.0 <2.0.0" }`, `dependencies: { "@loomcycle/client": "^0.9.2" }`, `engines.node: ">=20.15"`, `n8n: { n8nNodesApiVersion: 1, credentials: ["dist/credentials/LoomCycleApi.credentials.js"], nodes: [] }` | ~80 |
| `tsconfig.json` + `tsconfig.build.json` | `target: es2020`, `module: commonjs`, `strict: true`, mirrors `n8n-nodes-base` | ~40 |
| `.eslintrc.js` + `.eslintrc.prepublish.js` | `plugin:n8n-nodes-base/{community,credentials,nodes}` | ~55 |
| `.prettierrc.js` + `.prettierignore` | n8n-community standard (tabs, single quotes, semi true, printWidth 120) | ~15 |
| `gulpfile.js` | Single `build:icons` task copying `nodes/**/*.svg` to `dist/` | ~15 |
| `vitest.config.ts` + `test/setup.ts` | Vitest with mocked `n8n-workflow` interfaces | ~75 |
| `credentials/LoomCycleApi.credentials.ts` | `ICredentialType`: `baseUrl`, `bearerToken` (password), `userId?`, `userTier?`, `mcpUrl?`. `authenticate`: `Authorization: =Bearer {{$credentials.bearerToken}}`. `test`: `GET /healthz` | ~90 |
| `test/credentials/LoomCycleApi.test.ts` | Auth injection + healthz round-trip | ~80 |
| `.github/workflows/ci.yml` | Matrix Node 20/22; lint + typecheck + build + test | ~50 |
| `.github/workflows/publish.yml` | Dry-run-only until 2.6; trigger on `v*` tags | ~40 |
| `.gitignore` (modify) | Append `dist/`, `*.tsbuildinfo`, `coverage/` | +5 |
| `.npmignore` | Whitelist `dist/`, `LICENSE`, `README.md` | ~10 |
| `CHANGELOG.md` | Keep-a-Changelog; `[0.1.0]` entry | ~15 |
| `README.md` (stub) | Title + 1-paragraph status; real README lands in 2.6 | ~30 |

**Sketch — `credentials/LoomCycleApi.credentials.ts`:**

```ts
import type {
  IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties,
} from 'n8n-workflow';

export class LoomCycleApi implements ICredentialType {
  name = 'loomCycleApi';
  displayName = 'LoomCycle API';
  properties: INodeProperties[] = [
    { displayName: 'Base URL', name: 'baseUrl', type: 'string',
      default: 'http://127.0.0.1:8787', required: true },
    { displayName: 'Bearer Token', name: 'bearerToken', type: 'string',
      typeOptions: { password: true }, default: '', required: true },
    { displayName: 'Default User ID',   name: 'userId',   type: 'string', default: '' },
    { displayName: 'Default User Tier', name: 'userTier', type: 'string', default: '' },
    { displayName: 'MCP URL (optional)', name: 'mcpUrl',  type: 'string', default: '' },
  ];
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: { headers: { Authorization: '=Bearer {{$credentials.bearerToken}}' } },
  };
  test: ICredentialTestRequest = {
    request: { baseURL: '={{$credentials.baseUrl}}', url: '/healthz' },
  };
}
```

**Verification:** unit tests + manual save-and-test-button in local n8n against a `go run ./cmd/loomcycle`. No live CI integration yet.

**Open questions to settle during execution:**
1. CJS vs ESM build target. `@loomcycle/client` ships dual-build; verify n8n's loader accepts ESM before committing CJS-only.
2. `mcpUrl` / `userId` / `userTier` on credential vs per-node-parameter. Sketch puts on credential as defaults; per-node can override. Reaffirm during 2.1.

## Sub-phase 2.1 — Action nodes (Run, Memory, Channel)

**Goal:** ship the umbrella `LoomCycle` node with the 3 highest-volume resource groups. Operator drops node, picks Run/Memory/Channel, executes against live loomcycle.

**Files to create:**

| Path | Purpose | LOC |
|---|---|---|
| `nodes/LoomCycle/LoomCycle.node.ts` | Umbrella node; `INodeTypeDescription` + programmatic `execute()` with resource/op switch | ~250 |
| `nodes/LoomCycle/LoomCycle.node.json` + `.svg` | i18n + icon | ~40 + binary |
| `nodes/LoomCycle/descriptions/runs.ts` | 5 Run ops: Spawn / Get Status / Wait / Cancel / List Agents | ~200 |
| `nodes/LoomCycle/descriptions/memory.ts` | 7 Memory ops: List Scopes / List Scope IDs / List Entries / Get / Set / Delete / Search (Search capability-gated) | ~180 |
| `nodes/LoomCycle/descriptions/channels.ts` | 5 Channel ops: Publish / Subscribe / Peek / Ack / List Channels. All ops support `scope` parameter (`global` = admin; `user` = per-user) per v0.9.2 adapter shape. | ~160 |
| `nodes/LoomCycle/descriptions/index.ts` | Re-exports | ~10 |
| `nodes/LoomCycle/helpers/client.ts` | `getClient(this) → LoomcycleClient` from creds | ~30 |
| `nodes/LoomCycle/helpers/errors.ts` | `wrapLoomcycleError(err, node)`; **single source of truth for credential-boundary redaction** | ~80 |
| `nodes/LoomCycle/helpers/loadOptions.ts` | `loadAgents`, `loadChannels`, `loadMemoryScopes` for dynamic dropdowns | ~80 |
| `nodes/LoomCycle/helpers/segments.ts` | `string → PromptSegment[]` | ~30 |
| `nodes/LoomCycle/helpers/streaming.ts` | Drain `runStreaming` async-iterable into structured n8n output | ~80 |
| `test/nodes/LoomCycle/{runs,memory,channels,error-mapping}.test.ts` | ≥40 cases | ~690 |
| `package.json` modify | Add node to `n8n.nodes`; bump 0.2.0 | +2 |

**Sketch — `nodes/LoomCycle/LoomCycle.node.ts` (excerpt):**

```ts
import { INodeType, INodeTypeDescription, IExecuteFunctions } from 'n8n-workflow';
import { getClient } from './helpers/client';
import { wrapLoomcycleError } from './helpers/errors';
import { drainRunStream } from './helpers/streaming';
import { runOps, memoryOps, channelOps } from './descriptions';

export class LoomCycle implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'LoomCycle', name: 'loomCycle', icon: 'file:LoomCycle.svg',
    group: ['transform'], version: 1, defaults: { name: 'LoomCycle' },
    credentials: [{ name: 'loomCycleApi', required: true }],
    inputs: ['main'], outputs: ['main'],
    properties: [
      { displayName: 'Resource', name: 'resource', type: 'options',
        options: [{name:'Run',value:'run'},{name:'Memory',value:'memory'},{name:'Channel',value:'channel'}],
        default: 'run' },
      ...runOps, ...memoryOps, ...channelOps,
    ],
  };
  methods = { loadOptions: { loadAgents, loadChannels, loadMemoryScopes } };

  async execute(this: IExecuteFunctions) {
    const client = await getClient(this);
    const resource = this.getNodeParameter('resource', 0) as string;
    const op = this.getNodeParameter('operation', 0) as string;
    try {
      if (resource === 'run' && op === 'spawn') {
        const stream = client.runStreaming({ /* …from params… */ });
        return [this.helpers.returnJsonArray(await drainRunStream(stream))];
      }
      // …more branches…
    } catch (err) { throw wrapLoomcycleError(err, this.getNode()); }
  }
}
```

**Verification:** unit tests + Vitest integration suite gated on `LOOMCYCLE_BASE_URL` env var + manual canvas walkthrough screenshotted in PR.

**Open questions:**
1. `drainRunStream` blocks `execute()` until completion. Correct for sync action; long runs block n8n's worker. Document; direct operators to the RunCompleted trigger (2.3) for async patterns.
2. `Memory.Search` requires `LOOMCYCLE_PGVECTOR_ENABLED=1` + a configured embedder on loomcycle (v0.9.0 Vector Memory feature). Capability-gate this op specifically — surface a clear "Vector Memory not enabled on substrate" error if the backend refuses. Lower priority than the other Memory ops.

**Resolved upstream (no action needed):** Channel Publish / Subscribe / Peek / Ack shipped on the adapter at v0.9.2 (PR #180). Direct calls to `client.publishChannel(name, opts)` etc.; no one-shot-agent workaround.

## Sub-phase 2.2 — Action nodes (AgentDef, Evaluation, Context, MCPServerDef)

**Goal:** complete the action-node surface. **MCPServerDef 8 ops are the strategic differentiator.** Substrate + adapter are both live as of loomcycle v0.9.2 (PR #177) — no capability gate firing in steady state. The gate code path remains (forward-compat + pre-v0.9.2 operator deployments) but is exercised only by regression tests, not the happy path.

**Files to create:**

| Path | Purpose | LOC |
|---|---|---|
| `nodes/LoomCycle/LoomCycle.node.ts` modify | Add resources `agentDef` / `evaluation` / `context` / `mcpServerDef` to resource enum + execute branches | +120 |
| `nodes/LoomCycle/descriptions/agentdef.ts` | 7 ops: Get / List / Create / Fork / Promote / Retire / Verify | ~180 |
| `nodes/LoomCycle/descriptions/evaluations.ts` | 4 ops: Submit / Aggregate / List for Run / List for Def | ~120 |
| `nodes/LoomCycle/descriptions/context.ts` | 4 ops: Self / Lineage / History / Help (with topic dropdown) | ~120 |
| `nodes/LoomCycle/descriptions/mcpserverdef.ts` | 8 ops: Register (`op:"create"`) / Fork / Promote / Retire / Get / List / Rediscover / Verify. Stdio-reject + env-var-hint UI. Full end-to-end (substrate live in v0.9.2). | ~240 |
| `nodes/LoomCycle/helpers/capability.ts` | `requireLoomcycleVersion(client, minVersion)`; caches per-execution | ~50 |
| `nodes/LoomCycle/helpers/envVarHints.ts` | Scans header templates for `${LOOMCYCLE_*}` tokens; returns list for the "Required env vars on loomcycle" notice | ~40 |
| `nodes/LoomCycle/helpers/loadOptions.ts` modify | Add `loadAgentDefs`, `loadEvaluationTargets`, `loadHelpTopics`, `loadMcpServerDefs` | +80 |
| `test/nodes/LoomCycle/{agentdef,evaluations,context,mcpserverdef,capability-gate}.test.ts` | ~800 LOC, ≥40 cases, includes stdio-rejection + capability-gate firing + env-var-hint generation | ~800 |
| `package.json` modify | Bump 0.3.0; adapter pin `^0.9.2` covers all 2.2 features | +1 |

**Sketch — `descriptions/mcpserverdef.ts` (Register op, excerpt):**

```ts
{ displayName: 'Operation', name: 'operation', type: 'options',
  displayOptions: { show: { resource: ['mcpServerDef'] } },
  options: [
    { name: 'Register',   value: 'create',     description: 'Register an HTTP MCP server' },
    { name: 'Fork',       value: 'fork' },     { name: 'Promote', value: 'promote' },
    { name: 'Retire',     value: 'retire' },   { name: 'Get',     value: 'get' },
    { name: 'List',       value: 'list' },
    { name: 'Rediscover', value: 'rediscover', description: 'Refresh cached tools/list' },
    { name: 'Verify',     value: 'verify',     description: 'Bundle-vs-deployed sha256 check' },
  ], default: 'create' },
{ displayName: 'Name', name: 'name', type: 'string', required: true, default: '' },
{ displayName: 'Transport', name: 'transport', type: 'options',
  displayOptions: { show: { operation: ['create','fork'] } },
  options: [{ name: 'HTTP', value: 'http' }, { name: 'Streamable HTTP', value: 'streamable-http' }],
  default: 'http' },
{ displayName: 'URL', name: 'url', type: 'string', required: true,
  displayOptions: { show: { operation: ['create','fork'] } }, default: '' },
{ displayName: 'Headers', name: 'headers', type: 'fixedCollection', /* template-string headers */ },
{ displayName: 'Required env vars on loomcycle', name: 'envVarNotice', type: 'notice', default: '',
  description: 'Auto-detected from ${LOOMCYCLE_*} tokens in Headers.' },
```

**Verification:** unit tests + live loomcycle ≥v0.9.2 (single supported minimum — all features live). Verify Fork → Promote → Verify round-trip for AgentDef (smoke-tests content_sha256 path) and for MCPServerDef (same op surface). Verify `MCPServerDef.rediscover` refreshes `discovered_tools` cache against a test HTTP-MCP server.

**Open questions:**
1. `Context: Help` topic dropdown — load dynamically or hard-code? Recommend hard-coding + a "Refresh" affordance (n8n convention; fewer wire calls per render).
2. Env-var-hint reactive UI — n8n's `displayOptions` doesn't re-evaluate static `description` text. Investigate `loadOptionsDependsOn: ['headers']` pattern.

## Sub-phase 2.3 — Trigger nodes

**Goal:** event-driven workflows fire when loomcycle runs reach terminal states or messages arrive on channels. **SSE-primary + polling-fallback** because operator-deployment variance (Cloudflare, naive nginx reverse-proxy with `proxy_buffering on`) frequently breaks long-lived SSE. Toggle is a node parameter, not hidden recovery. Both triggers use direct adapter calls (no one-shot-agent workarounds) thanks to v0.9.2's Channel CRUD + `parentAgentId`/`debug` polish.

**Files to create:**

| Path | Purpose | LOC |
|---|---|---|
| `nodes/LoomCycleRunCompleted/LoomCycleRunCompleted.node.ts` | Trigger node; `trigger(this)` for SSE, `poll(this)` for fallback. Surfaces `parentAgentId` filter + `debug` toggle parameters (forwarded to `streamUserRunStates`). | ~200 |
| `nodes/LoomCycleRunCompleted/{node.json,svg}` | i18n + icon | ~30 + binary |
| `nodes/LoomCycleRunCompleted/helpers/sse.ts` | Wraps `client.streamUserRunStates`; 30-min reconnect transparent. `debug: true` emits `{kind:"close"}` meta-frames the node optionally surfaces. | ~100 |
| `nodes/LoomCycleRunCompleted/helpers/poll.ts` | Polls `listUserAgents`, dedups via `workflowStaticData`. Applies `parentAgentId` filter client-side (adapter passes it through `listUserAgents` options). | ~80 |
| `nodes/LoomCycleChannelMessage/LoomCycleChannelMessage.node.ts` | Long-poll trigger via direct `client.subscribeChannel(channel, opts)`. `scope` (`global`/`user`) + `waitMs` + `maxMessages` parameters. At-least-once mode toggles to `peekChannel` + explicit `ackChannel` after emit. | ~140 |
| `nodes/LoomCycleChannelMessage/{node.json,svg,helpers/subscribe.ts}` | i18n + icon + long-poll loop with backoff + ack-after-emit | ~90 + binary |
| `nodes/LoomCycle/helpers/staticData.ts` | Typed wrappers for `getWorkflowStaticData('node')` | ~30 |
| `test/nodes/LoomCycleRunCompleted/{sse,poll}.test.ts` | SSE event yield + reconnect; poll dedup | ~320 |
| `test/nodes/LoomCycleChannelMessage/subscribe.test.ts` | Happy path + timeout + backoff | ~160 |
| `package.json` modify | Add 2 trigger nodes; bump 0.4.0 | +2 |

**Sketch — `LoomCycleRunCompleted.node.ts` (excerpt):**

```ts
async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
  const mode = this.getNodeParameter('mode') as string;
  if (mode === 'poll') return { /* n8n's poll harness picks it up */ };
  const ac = new AbortController();
  const userId = this.getNodeParameter('userId') as string;
  const statuses = this.getNodeParameter('statuses') as string[];
  const parentAgentId = this.getNodeParameter('parentAgentId', '') as string;
  const debug = this.getNodeParameter('surfaceReconnects', false) as boolean;
  const client = new LoomcycleClient({ /* …from creds… */ });
  (async () => {
    for await (const item of client.streamUserRunStates(userId,
        { statuses, parentAgentId: parentAgentId || undefined, debug, signal: ac.signal })) {
      if (item.kind === 'event') this.emit([this.helpers.returnJsonArray([item.payload])]);
      else if (item.kind === 'close' && debug) { /* surface synthetic close to debug log */ }
    }
  })().catch((e) => this.emitError(e));
  return { closeFunction: async () => ac.abort() };
}
```

**Verification:** unit tests with mocked iterables + live loomcycle SSE fires within 100ms of `completed` + reconnect after `kill` mid-stream + nginx-with-`proxy_buffering` manual deployment test. Channel trigger verified against `client.subscribeChannel` direct path + the at-least-once `peekChannel`/`ackChannel` toggle.

**Resolved upstream (no action needed):**
- Surfacing reconnect events to operator — adapter's `debug: true` yields synthetic `{kind:"close",payload:{reason}}` meta-frames (PR #181). Node parameter "Surface reconnect events" maps to this directly.
- `parentAgentId` filter — adapter exposes `parentAgentId` option on `streamUserRunStates`; the node parameter forwards it (PR #181). Client-side filter applied before the iterator yields.

**Open questions:**
1. Multi-trigger fan-out: if two RunCompleted triggers in different workflows watch the same `user_id`, each gets its own SSE connection. Document the resource cost (N concurrent SSE streams) in node description.

## Sub-phase 2.4 — Cluster sub-nodes

**Goal:** 5 sub-nodes plug into n8n's built-in AI Agent. Loomcycle primitives (Memory, Channel, Sub-Agent, Context.help, **MCP Server**) become tools the n8n-side LLM can call.

**Files to create:**

| Path | Purpose | LOC |
|---|---|---|
| `nodes/LoomCycleMemoryTool/{*.node.ts,json,svg}` | `supplyData` returns `{ type: AiTool, value: { name, description, function } }` calling `client.getMemoryEntry` / `listMemoryEntries` / set / delete | ~170 + binary |
| `nodes/LoomCycleChannelTool/{*.node.ts,json,svg}` | 4-op (Publish/Subscribe/Peek/Ack) sub-node | ~185 + binary |
| `nodes/LoomCycleSubAgentTool/{*.node.ts,json,svg}` | Spawns loomcycle sub-agent via `runStreaming`, returns final text | ~205 + binary |
| `nodes/LoomCycleContextHelpTool/{*.node.ts,json,svg}` | Returns Context.help bodies | ~125 + binary |
| `nodes/LoomCycleMcpServerTool/LoomCycleMcpServerTool.node.ts` | **The big one.** Parameters: `name`, `cleanupOnEnd: boolean (default: false)`. `supplyData`: (1) sniff parent-canvas MCP-Client-Tool config OR accept explicit URL/transport/headers params; (2) refuse stdio with `NodeOperationError`; (3) URL host pre-check via `health()` (best-effort UI hint); (4) idempotent ensure (`mcpServerDef({op:"get"})` → on `NotFoundError`, `mcpServerDef({op:"create",...})`); (5) append `mcp__<name>__*` to spawn `allowed_tools`; (6) if `cleanupOnEnd: true`, workflow-end hook calls `retire`. | ~280 |
| `nodes/LoomCycleMcpServerTool/{node.json,svg,helpers/sniff.ts}` | i18n with env-var-mirror notice + icon + parent-canvas sniffing | ~120 + binary |
| `nodes/_shared/clusterTool.ts` | `buildTool({name, description, schema, fn})` constructs the `DynamicStructuredTool` shape | ~50 |
| `test/nodes/cluster/{memoryTool,channelTool,subAgentTool,contextHelpTool,mcpServerTool}.test.ts` | ≥50 cases. mcpServerTool: idempotent-ensure path; stdio-rejection; `cleanupOnEnd:false` default; env-var hints; capability-gate firing | ~830 |
| `package.json` modify | Add 5 sub-nodes; bump 0.5.0 | +5 |

**Sketch — `LoomCycleMcpServerTool.node.ts` (excerpt):**

```ts
import { ISupplyDataFunctions, INodeType, NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { LoomcycleClient, NotFoundError } from '@loomcycle/client';
import { sniffMcpClientConfig } from './helpers/sniff';

export class LoomCycleMcpServerTool implements INodeType {
  description = {
    displayName: 'LoomCycle MCP Server Tool', name: 'loomCycleMcpServerTool',
    icon: 'file:LoomCycleMcpServerTool.svg', group: ['transform'], version: 1,
    codex: { categories: ['AI'], subcategories: { AI: ['Tools'] } },
    inputs: [], outputs: [NodeConnectionType.AiTool], outputNames: ['Tool'],
    credentials: [{ name: 'loomCycleApi', required: true }],
    properties: [
      { displayName: 'MCP Server Name', name: 'name', type: 'string', required: true, default: '' },
      { displayName: 'Cleanup On Workflow End', name: 'cleanupOnEnd', type: 'boolean', default: false,
        description: 'When true, retire the registration when the workflow execution ends. Default false: registrations persist across executions so multiple agentic teams share stable MCP fleets.' },
    ],
  };
  async supplyData(this: ISupplyDataFunctions) {
    const name = this.getNodeParameter('name', 0) as string;
    const cfg = sniffMcpClientConfig(this); // throws if stdio
    const client = new LoomcycleClient({ /* …creds… */ });
    try { await client.mcpServerDef({ op: 'get', name }); }
    catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
      await client.mcpServerDef({ op: 'create', name,
        transport: cfg.transport, url: cfg.url, headers: cfg.headers });
    }
    if (this.getNodeParameter('cleanupOnEnd', 0) === true) {
      // register workflow-end hook → retire(name)
    }
    return { response: { type: NodeConnectionType.AiTool, value: {
      name: `loomcycle_mcp_${name}`,
      description: `MCP server ${name} (provisioned in loomcycle substrate)`,
      function: async () => ({ /* parent agent invokes via mcp__<name>__* */ }),
    } } };
  }
}
```

**Verification:** unit tests with mocked adapter + live loomcycle ≥v0.9.2 (single supported minimum — MCPServerDef substrate + Channel CRUD both live) end-to-end coverage for all 5 sub-nodes + manual n8n AI Agent + sub-node + Run-node canvas walkthrough. Test the ensure path twice in sequence (second call must be a `get` no-op). Verify `cleanupOnEnd: true` retires after workflow ends.

**Open questions:**
1. Sniff parent canvas via `getInputConnectionData()` / `getParentNodes()` — investigate; fall back to explicit-config UI fields (URL + transport + headers on the sub-node) as MVP. Sniffing becomes 2.4.1 polish.
2. Tool-name collisions across multiple MCP-Server-Tool instances — reject duplicates at `supplyData` time.
3. n8n cluster-node API stability — pin `peerDependencies: { "n8n-workflow": ">=1.82.0 <2.0.0" }`; revisit on each n8n major.

## Sub-phase 2.5 — Examples + integration tests

**Goal:** 6 importable workflow JSONs that double as integration tests. Each runs end-to-end against a live loomcycle in CI.

**Files to create:**

| Path | Purpose | LOC (JSON) |
|---|---|---|
| `examples/01-multi-agent-research.json` | researcher → summariser, Channel hand-off | ~150 |
| `examples/02-slack-loomcycle-slack.json` | Slack trigger → Run → Slack post | ~120 |
| `examples/03-daily-evaluation-report.json` | Cron → Evaluation.aggregate → email | ~100 |
| `examples/04-n8n-as-loomcycle-tool.json` | Vector 2: loomcycle agent calls n8n webhook as tool | ~80 |
| `examples/05-ai-agent-with-loomcycle-memory.json` | n8n AI Agent + LoomCycleMemoryTool + LoomCycleSubAgentTool | ~140 |
| `examples/06-dynamic-mcp-provisioning.json` | **Crown jewel.** Slack MCP Client Tool + LoomCycleMcpServerTool + Run. Capability-gated. | ~180 |
| `examples/README.md` | Per-example narrative + required loomcycle version | ~250 |
| `test/integration/run-example.test.ts` | Imports each JSON, validates schema, executes via `n8n execute --file=…`; skips when `LOOMCYCLE_BASE_URL` unset | ~300 |
| `test/integration/live-loomcycle.test.ts` | Full smoke matrix across all 2.1–2.4 nodes | ~400 |
| `scripts/start-loomcycle.sh` | Local helper | ~30 |
| `.github/workflows/integration.yml` | Daily cron CI: loomcycle + n8n containers + integration suite | ~80 |
| `package.json` modify | Bump 0.6.0 | +1 |

**Verification:** CI matrix loomcycle × n8n version pairs + each example imports + executes + asserts expected output.

**Open questions:**
1. n8n trigger-driven workflows in CI — `n8n execute --file=` doesn't trigger triggers; wrap each as a trigger-less variant for CI smoke (manual trigger node replaces real triggers).
2. CI credentials — `LOOMCYCLE_BASE_URL` + `LOOMCYCLE_AUTH_TOKEN` as GitHub secrets; bootstrap script creates the n8n credential row.

## Sub-phase 2.6 — Docs + npm publish + community-node submission

**Goal:** publish `n8n-nodes-loomcycle@1.0.0` to npm + submit to n8n's community-node directory.

**Files to create/modify:**

| Path | Purpose | LOC |
|---|---|---|
| `README.md` rewrite | Full operator-facing: install / configure / per-node reference / examples / troubleshooting / "Provisioning MCP servers" env-var-mirror section / loomcycle-version matrix | ~600 |
| `CHANGELOG.md` modify | `[1.0.0]` entry with full feature list | +60 |
| `package.json` modify | Bump 1.0.0; `"publishConfig": { "access": "public" }`; whitelist `"files"` | +5 |
| `.github/workflows/publish.yml` modify | Wire to `tags: v*`; add `npm provenance` | +10 |
| `doc/RELEASE.md` | Release checklist | ~80 |
| `doc/SUPPORT.md` | Operator support matrix + breaking-change policy | ~50 |

**Verification:** full re-run of 2.5 integration suite against the *published* npm artefact (catches build/publish skew) + dry-run install in fresh n8n container.

**Open questions:**
1. Publish `1.0.0-rc1` for one-week soak before stable + directory PR. Recommend yes.
2. npm scope — RFC locks unscoped `n8n-nodes-loomcycle`. Honour the lock.

## Risk register

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | n8n version drift breaks cluster-node API | High — 2.4 nodes stop loading on n8n bumps | Pin `n8n-workflow >=1.82.0 <2.0.0`; CI matrix; subscribe to n8n release notes |
| 2 | SSE breaks behind operator reverse proxies | High — 2.3 RunCompleted goes deaf | Polling fallback as first-class toggle; doc deployment patterns; surface "stream closed" warning |
| 3 | Credential leak via `LoomcycleError.bodyText` | High — bearer fragments in execution-log UI | `wrapLoomcycleError` strips header-shaped substrings; regression test asserts redaction |
| 4 | **(RESOLVED 2026-05-22)** MCPServerDef substrate slip | (resolved) | Substrate shipped in loomcycle v0.9.2 PR #177; Channel CRUD in PR #180; `parentAgentId`/`debug` polish in PR #181. The package depends on a stable substrate baseline (v0.9.2) — no capability-gate firing on the happy path. The gate code path remains for forward-compat. |
| 5 | `@loomcycle/client` minor breaks our API | Medium — node code stops compiling on `npm install` after substrate-driven adapter bump | Pin `^0.9.2`; major bumps coordinated per CLAUDE.md §cross-repo; CI tests lowest + highest in range. Adapter currently tracks loomcycle's minor version (v0.9.x adapter = v0.9.x substrate). |
| 6 | npm publish vs directory PR ordering | Low — package on npm but not in n8n UI | Publish `1.0.0-rc1`, soak 1 week, submit directory PR, bump 1.0.0 on merge |
| 7 | Vitest mocked `IExecuteFunctions` drifts from real | Low — tests pass, n8n fails | Minimal mocks in `test/setup.ts`; contract tests against real `n8n-workflow` package |

## Naming conventions — lock now

| Dimension | Convention |
|---|---|
| npm package name | `n8n-nodes-loomcycle` (no scope; RFC-locked) |
| Credential `name` | `loomCycleApi` (camelCase) |
| Credential fields | `baseUrl`, `bearerToken`, `userId`, `userTier`, `mcpUrl` |
| Node display names | `LoomCycle`, `LoomCycle: Run Completed`, `LoomCycle: Channel Message`, `LoomCycle Memory Tool`, `LoomCycle Channel Tool`, `LoomCycle Sub-Agent Tool`, `LoomCycle Context Help Tool`, `LoomCycle MCP Server Tool` |
| Node IDs | `loomCycle`, `loomCycleRunCompleted`, `loomCycleChannelMessage`, `loomCycleMemoryTool`, `loomCycleChannelTool`, `loomCycleSubAgentTool`, `loomCycleContextHelpTool`, `loomCycleMcpServerTool` |
| Resource enum (umbrella) | `run`, `memory`, `channel`, `agentDef`, `evaluation`, `context`, `mcpServerDef` |
| Operation enum | Map 1:1 to substrate-tool op strings; `op:"create"` rendered as "Register" for MCPServerDef |
| Minimum n8n | `>=1.82.0` |
| Minimum Node | `>=20.15.0` |
| TypeScript target | `es2020` / `commonjs` |
| `@loomcycle/client` pin | `^0.9.2` (entire Phase 2; adapter follows loomcycle minor track) |
| Branch naming | `feature-<short-desc>` |
| Commit subject | `<scope>(<area>): imperative verb under 72 chars` |
| Tag format | `v<semver>` |

## Critical files (highest-leverage, write/review first)

1. **`credentials/LoomCycleApi.credentials.ts`** — every node depends on it. Mistakes cascade.
2. **`nodes/LoomCycle/LoomCycle.node.ts`** — umbrella node; its `execute()` + resource/op switch + error mapping is the template for 2.1, 2.2, and indirectly 2.4.
3. **`nodes/LoomCycle/helpers/errors.ts`** — single source of truth for typed-error → `NodeApiError` mapping + credential-boundary redaction. CLAUDE.md §security.6.
4. **`nodes/LoomCycleRunCompleted/LoomCycleRunCompleted.node.ts`** — SSE-primary, poll-fallback. Hardest-to-test surface.
5. **`nodes/LoomCycleMcpServerTool/LoomCycleMcpServerTool.node.ts`** — strategic differentiator. Every locked decision in `doc-internal/mcp-server-def-cross-repo.md` lands here.

## Verification approach

| Sub-phase | Unit test | Type check | Lint | Manual n8n | Live loomcycle | CI integration |
|---|---|---|---|---|---|---|
| 2.0 | ✓ | ✓ | ✓ | save creds + green button | `/healthz` round-trip | n/a |
| 2.1 | ✓ per op | ✓ | ✓ | each op rendered + executed | end-to-end per op | env-gated |
| 2.2 | ✓ per op | ✓ | ✓ | each op rendered | end-to-end + capability gate | MCPServerDef skipped if substrate missing |
| 2.3 | ✓ SSE + poll | ✓ | ✓ | trigger fires on real run | end-to-end | daily cron |
| 2.4 | ✓ per tool | ✓ | ✓ | each plugged into AI Agent | end-to-end | daily cron |
| 2.5 | – | – | ✓ JSON schema | import + run each | each in CI matrix | matrix |
| 2.6 | full re-run | full re-run | full re-run | install from npm in clean n8n | post-publish smoke | matrix on published artefact |

## Existing patterns to reuse (do not reinvent)

- **`@loomcycle/client` v0.9.2** at `~/work/loomcycle/adapters/ts/src/` — 36 methods covering every wire op. Load-bearing references: `client.ts:618 mcpServerDef`, `client.ts:752/773/791/807 publishChannel/subscribeChannel/peekChannel/ackChannel`, `client.ts:841 streamUserRunStates` (with `parentAgentId` + `debug`), `errors.ts` (15 typed error classes), `stream.ts` (SSE iterator helpers).
- **`n8n-nodes-base/Notion`** (and similar SDK-driven nodes in the n8n-base repo) — canonical umbrella-node + resource/operation pattern reference. Mimic shape.
- **`n8n-nodes-langchain`** cluster sub-node implementations — reference for `supplyData` + `NodeConnectionType.AiTool` patterns (2.4).
- **CLAUDE.md** in this repo — 8 locked design constraints; security rules; cross-repo coordination policy.
- **`doc-internal/mcp-server-def-cross-repo.md`** — every locked decision for the MCP-Server-Tool sub-node lands in `nodes/LoomCycleMcpServerTool/`.

## Deliverable

Next step: **Sub-phase 2.0** — repo scaffolding + `LoomCycleApi` credential. Files per the 2.0 table; `^0.9.2` adapter pin; `>=1.82.0 <2.0.0` n8n-workflow peer-dep range.

Subsequent sub-phases ship as independent PRs / npm pre-releases against the **loomcycle v0.9.2 substrate baseline** (no upstream gates). Public `1.0.0` lands at 2.6 alongside the n8n community-node directory submission.

## Refactor history

- **2026-05-22 — initial plan written**, post-RFC-lock (2026-05-19) + MCPServerDef cross-repo lock (2026-05-22). Drafted against `@loomcycle/client` v0.11.x (incorrect — adapter was actually v0.9.x track) with multiple capability-gate paths for upstream-pending features.
- **2026-05-22 — refactored** after pulling loomcycle commits 270e0dd→9c8baae. Key resolutions: MCPServerDef substrate live (PR #177), Channel CRUD adapter ops shipped (PR #180), `parentAgentId` + `debug` polish on `streamUserRunStates` (PR #181). Adapter pin corrected to `^0.9.2`. All "Open questions to loomcycle functionality" closed; remaining open questions are n8n-side implementation choices only.
