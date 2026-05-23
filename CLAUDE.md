# CLAUDE.md — n8n-nodes-loomcycle project guide

This file is loaded by Claude Code on every session in this repo. Read it cold; act from it without re-discovery.

## Project context

**n8n-nodes-loomcycle** is a community-distributed npm package that adds first-class drag-and-drop nodes for [loomcycle](https://github.com/denn-gubsky/loomcycle) inside [n8n](https://n8n.io). It is **Tier B / Phase 2** of the locked RFC `~/work/loomcycle-internal/doc-internal/rfcs/n8n-comparison.md` ("the most strategically valuable integration finding in the comparison series"). The repo is currently empty (LICENSE + .gitignore + .git only) — every file in this directory will be authored from scratch.

The pairing this package realises:

```
   n8n  (agentic-system DESIGNER: visual builder, 400+ integrations, triggers)
     │
     ├─ n8n-nodes-loomcycle   ←  THIS REPO  (drag-and-drop nodes + triggers + cluster sub-nodes)
     │     │
     │     └─ @loomcycle/client (npm, ~/work/loomcycle/adapters/ts/, v0.11.1)
     │            │ HTTP + SSE
     │            ▼
     │     loomcycle  (agentic OS / SUBSTRATE: Go binary, agent loop, providers, MCP, snapshots)
     │
     └─ (also: MCP Client Tool ──direct──▶ loomcycle MCP server   — Vector 1, zero-code)
     └─ (also: MCP Server Trigger ◀──direct── loomcycle agent     — Vector 2, zero-code)
```

The RFC defines three integration **vectors**; this repo implements **Vector 3** (custom nodes). Vectors 1 + 2 are documentation-only and live in loomcycle core (Phase 1, already shipped in v0.9.x via the `n8n-integration` Context.help topic).

**Strategic stance — substrate composition.** n8n is the visual designer where operators **architect/manage** agentic systems; loomcycle is the **agentic OS** where those systems run with reproducibility, safety, snapshots, AgentDef versioning, and multi-provider/multi-tenant guarantees. This package is the glue. We do **not** pull loomcycle features into n8n or n8n features into loomcycle — the integration is composition via the wire API.

**Wire-API contract = `@loomcycle/client`.** Every loomcycle operation this package exposes already exists as a typed method on `@loomcycle/client` (31 methods through v0.11.x — run streaming, agent metadata, transcript, pause/resume/state, snapshot lifecycle, memory admin, interruption resolve, hook management, `agentDef` + `skillDef`, **`listChannels` + `streamUserRunStates`** added in v0.9.x for our trigger nodes). We are an n8n-shaped wrapper over that adapter; we do not hand-write HTTP/SSE plumbing.

## Where this repo sits in the stack

| Repo | Location | Language | Role |
|---|---|---|---|
| **n8n-nodes-loomcycle** | `~/work/n8n-nodes-loomcycle/` (this repo) | TypeScript | Community n8n node package — the visual surface for loomcycle ops inside n8n |
| loomcycle | `~/work/loomcycle/` | Go | The agentic-OS substrate. Source of the wire API. Public Apache-2.0. |
| `@loomcycle/client` | `~/work/loomcycle/adapters/ts/` → `npm: @loomcycle/client` | TypeScript | The HTTP+SSE adapter we depend on as an npm dependency |
| loomcycle-internal | `~/work/loomcycle-internal/` | docs | Operator-side gitignored RFCs + PLAN.md. **Source of truth** for the n8n integration design (`rfcs/n8n-comparison.md`). |

The loomcycle wire API and the `@loomcycle/client` adapter are upstream. **Do not modify them from this repo.** Wire-API gaps surface as a Phase 0 ticket in the loomcycle repo (already complete for n8n's needs).

## Current status

- Empty repo. `git log` shows only the initial commit.
- Phase 0 dependencies in loomcycle core (`GET /v1/_channels`, `GET /v1/users/{user_id}/agents/stream`) **shipped in v0.9.x**.
- Phase 1 dependencies in loomcycle core (`Context.help` topic `n8n-integration`, the example yaml block) **shipped in v0.9.x**.
- Phase 2 (this repo) begins from a planning pass. The RFC lays out 7 sub-phases (2.0 scaffolding → 2.6 publish); see "RFC implementation phases" below.

## Scope (RFC-locked)

Per `~/work/loomcycle-internal/doc-internal/rfcs/n8n-comparison.md` "Repository plan" — ~25 files total:

```
n8n-nodes-loomcycle/
├── README.md                         (operator docs)
├── package.json                      (name: n8n-nodes-loomcycle; depends on @loomcycle/client)
├── tsconfig.json
├── credentials/
│   └── LoomCycleApi.credentials.ts   (bearer token + base URL + optional MCP URL/user_id/user_tier)
├── nodes/
│   ├── LoomCycle/                    (umbrella action node, multi-operation)
│   │   ├── LoomCycle.node.ts
│   │   ├── LoomCycle.node.json       (i18n strings)
│   │   ├── LoomCycle.svg             (node icon)
│   │   └── descriptions/             (per-operation parameter schemas)
│   │       ├── runs.ts               (Spawn Run, Get Status, Wait, Cancel, List Agents)
│   │       ├── memory.ts             (Get, Set, List, Increment, Delete, Sweep, Search [v0.9.0])
│   │       ├── channels.ts           (Publish, Subscribe, Peek, Ack, List Channels)
│   │       ├── agentdef.ts           (Get, Fork, Promote, List, Retire, Verify [v0.9.x])
│   │       ├── evaluations.ts        (Submit, Aggregate, List for Run, List for Def)
│   │       ├── context.ts            (Self, Lineage, History, Help)
│   │       └── mcpserverdef.ts       (Register, Fork, Promote, Retire, Get, List, Rediscover, Verify — gated on upstream)
│   ├── LoomCycleRunCompleted/        (trigger: SSE-driven, polling fallback)
│   ├── LoomCycleChannelMessage/      (trigger: long-poll subscribe)
│   ├── LoomCycleMemoryTool/          (AI-Agent cluster sub-node)
│   ├── LoomCycleChannelTool/         (AI-Agent cluster sub-node)
│   ├── LoomCycleSubAgentTool/        (AI-Agent cluster sub-node)
│   ├── LoomCycleMcpServerTool/       (cluster sub-node: HTTP/Streamable-HTTP only, idempotent ensure-on-spawn, cleanupOnEnd: false default)
│   └── LoomCycleContextHelpTool/     (AI-Agent cluster sub-node)
├── test/                              (Jest or Vitest; n8n test harness)
└── examples/                          (5 importable n8n workflow JSONs)
    ├── multi-agent-research.json
    ├── slack-loomcycle-slack.json
    ├── daily-evaluation-report.json
    ├── n8n-as-loomcycle-tool.json
    └── ai-agent-with-loomcycle-memory.json
```

## Dynamic MCP server provisioning (forward-looking feature — coordinates with upstream `MCPServerDef`)

A signature differentiator for this package: when a user drags an MCP tool onto an n8n agentic diagram and wires it into a loomcycle Run / sub-agent, the MCP server should be **instantly provisioned in the loomcycle substrate** and made available to the spawned (or updated) agent — no operator yaml edit, no loomcycle restart.

This depends on the upcoming loomcycle substrate primitive **`MCPServerDef`** (**plan locked 2026-05-22** by operator; substrate-side implementation pending). `MCPServerDef` mirrors the `AgentDef` / `SkillDef` pattern: versioned `mcp_server_defs` + `mcp_server_def_active` tables, lineage, `content_sha256`, exposed via the `Connector` interface so it ships uniformly across HTTP admin (`POST /v1/_mcpserverdef`), gRPC, the LoomCycle MCP `mcpserverdef` meta-tool, and `@loomcycle/client.mcpServerDef()`. Until the substrate lands, this package ships node UI shells behind a `loomcycleVersion < required` capability gate that degrades gracefully.

**Source of truth for the cross-repo design:** `~/work/n8n-nodes-loomcycle/doc-internal/mcp-server-def-cross-repo.md` — reflects the locked plan + n8n-side implications. The authoritative substrate-side RFC lives at `~/work/loomcycle-internal/doc-internal/rfcs/mcp-server-def.md` (pending — to be written from the locked plan).

### Why it matters

Today, adding an MCP server to loomcycle requires editing `loomcycle.yaml`'s `mcp_servers:` block + restarting the binary. That's fine for operator-curated production deployments — but it's friction-heavy for the n8n design surface where a user is *iterating* on agent compositions visually. The whole point of n8n as a "design surface for agentic systems running on loomcycle" is that wiring an MCP integration into an agent should be **one drag operation** that propagates to the substrate.

This is the n8n-side realisation of **RFC Vector 2** ("loomcycle agents call n8n workflows / external MCP servers as tools") but elevated from "documentation only" to "first-class node behaviour that auto-wires the substrate."

### UX shape

Two complementary entry points, both authorised by the **workflow's loomcycle bearer (operator scope)** — registration is operator-admin-only per the locked plan:

1. **`LoomCycle: MCP Server` action node.** Eight ops mirroring the substrate exactly: `Register` (→ create) / `Fork` / `Promote` / `Retire` (→ unregister) / `Get` / `List` / `Rediscover` (refresh cached tool set) / `Verify` (content_sha256 round-trip). Operator wires it into a workflow that runs at activation time, provisioning MCP servers ahead of any Run nodes. Useful for "set up this canvas's MCP fleet" workflows.
2. **`LoomCycle MCP Server Tool` cluster sub-node.** Plugs into a `LoomCycle: Run` node (or an n8n AI Agent calling loomcycle via Vector 1) the way `LoomCycle Memory Tool` does. On `supplyData`: reads the parent canvas's MCP-Client-Tool sub-node config (URL + transport + headers), **rejects stdio transport** with a typed error (loomcycle requires yaml for stdio MCPs), pre-checks the URL against loomcycle's host allowlist via `/v1/_resolver`, performs an **idempotent ensure** (call `get`; if missing, call `create`), then appends `mcp__<name>__*` tool patterns to the spawn's `allowed_tools`. Lifecycle: **`cleanupOnEnd: false` default** — registrations persist across workflow executions so multiple agentic teams can share stable registrations without churn. Operators opt in to retire-on-workflow-end via the sub-node parameter when they want ephemeral / scoped registrations.

Both entry points share the same `@loomcycle/client.mcpServerDef(input)` call site.

### Locked design decisions (operator, 2026-05-22)

| Dimension | Decision |
|---|---|
| Trust model | **Operator-admin-only.** Bearer-authed `POST /v1/_mcpserverdef` + LoomCycle MCP `mcpserverdef` meta-tool. **No per-agent substrate tool. No `mcp_server_def_scopes:` on agent yaml.** Closes the agent-escalation path. |
| Transport scope | **HTTP + Streamable-HTTP only.** Stdio MCP servers remain yaml-only — closes the agent-spawned-subprocess escalation path. n8n nodes refuse stdio configs with a clear error. |
| Versioning ops | **8 ops:** `create` / `fork` / `get` / `list` / `promote` / `retire` + `rediscover` (refresh cached tool set) + `verify` (content_sha256 parity). Mirrors AgentDef/SkillDef with MCP-specific extras. |
| Lifecycle | **Persistent until explicit `retire`.** No TTL sweep. Boot reloads active rows into `DynamicRegistry`. Cluster sub-nodes that want execution-scoped cleanup call `retire` explicitly. |
| Static yaml coexistence | **Coexist.** Yaml entries boot-load unchanged with no DB row. Dynamic creates colliding with a yaml-occupied name are **refused** (yaml = ground truth). |
| Per-user scoping | **Global** (operator-admin-only collapses multi-tenancy to operator-trust). |
| Credential boundary | **Template-string headers.** Headers carry the `${LOOMCYCLE_*}` + `${run.user_bearer:-FALLBACK}` substitution patterns from v0.8.14. **Plaintext credentials never travel through `mcpServerDef.register`** — only template strings. n8n nodes must render a "Required env vars on loomcycle: …" reminder for every `${LOOMCYCLE_*}` token in the headers. |
| URL host-allowlist | **Enforced at the substrate's registration boundary.** Hostname checked against `config.HTTPHostAllowlist`; mismatch → `MCPServerHostNotAllowedError`. n8n nodes pre-check via `/v1/_resolver` as a UI hint but cannot bypass. |
| Dispatcher integration | **Reuses the v0.8.1 lazy-fallback resolver.** No dispatcher refresh, no `allTools` mutation. Agent calls `mcp__<dynamic-name>__<tool>` → falls through `mcpLazyResolver` → pool's `build()` looks up name in both yaml-static map AND `DynamicRegistry`. |

### Cross-repo dependency chain

| Step | Repo | Status | Notes |
|---|---|---|---|
| 1. RFC `mcp-server-def.md` | `loomcycle-internal` | **plan LOCKED 2026-05-22; RFC write-up pending** | Reflects the locked plan above. |
| 2. Implement `MCPServerDef` in loomcycle core | `loomcycle` | pending | New builtin, `mcp_server_defs` + `mcp_server_def_active` tables (PG migration 0020 + SQLite ALTER), boot backfill of `content_sha256`, `DynamicRegistry` + pool integration, snapshot envelope additive sections, URL host-allowlist enforcement. |
| 3. Wire surfaces | `loomcycle` | pending | `Connector.MCPServerDef`, `POST /v1/_mcpserverdef`, gRPC RPC, LoomCycle MCP `mcpserverdef` meta-tool (count 28 → 29). |
| 4. TS adapter method | `loomcycle/adapters/ts/` | pending | `client.mcpServerDef(input)` + typed `MCPServerDefVerifyResult` + minor version bump on `@loomcycle/client`. |
| 5. `LoomCycle: MCP Server` action node | **THIS REPO** | depends on step 4 | `descriptions/mcpserverdef.ts` with the 8 ops; load-options helper for snapshotting MCP-Client-Tool-sub-node configs from the parent canvas. |
| 6. `LoomCycle MCP Server Tool` cluster sub-node | **THIS REPO** | depends on step 4 + 5 | `supplyData` → reject stdio → host pre-check → idempotent ensure (get-then-create) → append `mcp__<name>__*` to spawn's `allowed_tools` → optional opt-in retire-on-workflow-end. |
| 7. Sixth example workflow | **THIS REPO** | depends on step 6 | Drag Slack-MCP node + `LoomCycle: Run` node → spawn loomcycle agent that posts to Slack via just-provisioned MCP server. |

Steps 1–4 must land in loomcycle / `@loomcycle/client` **before** this repo can implement steps 5–7. This repo can ship the node UI shells behind a `loomcycleVersion < required` capability gate ahead of step 4 ("Requires loomcycle vX.Y — feature pending"), preserving forward-compatibility without blocking the initial npm publish.

### The env-var-mirror UX gap

Because headers are template strings and loomcycle does the substitution from its own env, **the operator must mirror the credential**: it lives in n8n (for n8n's own use of the MCP server) AND in loomcycle's env (for loomcycle agents' use of the same MCP server). The n8n node must surface this clearly — detect `${LOOMCYCLE_*}` tokens in the header template + render a "Required env vars on loomcycle: …" panel in the node UI + document the pattern in the README's "Provisioning MCP servers" section. There is no automatic bridge (loomcycle deliberately doesn't expose env-var writes via API).

### Substrate-stance preserved

This feature does **not** violate the substrate stance. n8n stays the design surface; loomcycle stays the runtime. The new wire call is one substrate-side admin op (`mcpServerDef.register`); the n8n nodes are a thin UI over that op. No n8n features migrate into loomcycle; no loomcycle features migrate into n8n. The composition story stays clean: every UI action in n8n maps to a single typed wire call, executed by the substrate.

## RFC implementation phases

The RFC fixes the build order. Each sub-phase is one PR / one release.

| Sub-phase | Scope | Output |
|---|---|---|
| **2.0** | Repo scaffolding (package.json with `n8n-workflow` peer dep, tsconfig, CI), `LoomCycleApi` credential type with `/healthz` test, `@loomcycle/client` wired up | One credential type; green CI; `npm install @loomcycle/n8n-nodes-loomcycle` works in a local n8n |
| **2.1** | Action nodes: Run, Memory, Channel | 3 node files, ~12 operations; auto-discovery dropdowns for agent / channel |
| **2.2** | Action nodes: AgentDef, Evaluation, Context | 3 more node files, ~12 more operations |
| **2.3** | Trigger nodes: `LoomCycle: Run Completed`, `LoomCycle: Channel Message` | SSE transport (primary, via `client.streamUserRunStates`) + polling fallback; n8n lifecycle hooks for connection management |
| **2.4** | Cluster sub-nodes: Memory Tool, Channel Tool, Sub-Agent Tool, Context Help Tool | Pluggable into n8n's built-in AI Agent node |
| **2.5** | 5 example workflows + integration tests against a live loomcycle | JSON templates importable from `examples/` |
| **2.6** | Docs, npm publish, submission to n8n community-node directory | `npmjs.com/package/n8n-nodes-loomcycle` live; listed in `docs.n8n.io/integrations/community-nodes/` |

## Development workflow

This is the chain you follow for every non-trivial change. Don't skip stages; the discipline is what keeps the codebase small and reviewable. (Inherited from loomcycle's CLAUDE.md; n8n/TS-adapted.)

1. **Architect** — read the n8n docs for the surface you're touching (`INodeType`, `ITriggerFunctions`, `ILoadOptionsFunctions`, `IExecuteFunctions`, cluster-node `supplyData`). Look at how existing n8n community nodes (`n8n-nodes-base`) implement the same pattern. If you can't articulate which n8n interface contract your change implements, you're not ready to plan.
2. **Plan** — for anything beyond a one-line fix, write a plan. Include critical files, the change, the n8n version targeted, and a verification step. Validate scope with the user when the change touches the credential shape, the wire surface, or the published node manifest.
3. **Feature branch** — `feature-<short-description>` off `main`. Never commit to `main` directly.
4. **Code** — small focused commits. Each commit should be reviewable in isolation. No "and also fixed this" omnibus commits.
5. **Tests** — unit tests for new code, regression tests for fixes. A regression test must *fail on the unfixed code* — verify this by reverting your fix and watching the test fail before you commit it. Use Vitest (parity with `@loomcycle/client`'s test harness).
6. **Self-review** — read your own diff cold. Look for accidentally-committed secrets, dead code, debug `console.log`s, `TODO` without a follow-up issue, leaked `any` types.
7. **Typecheck + tests** — `npm run typecheck && npm test`. Must pass clean. No `// @ts-ignore` or `as unknown as X` shortcuts. Don't commit "with one known failing test."
8. **Manual test in a real n8n** — install the local build into a local n8n (`npm link` workflow, or n8n's `Custom Nodes` directory). Drag the node onto a canvas; configure credentials; run against a real loomcycle. Screenshot the node + the execution output for the PR body.
9. **PR** — one branch, one PR. Title says what the change does in one line. Body explains *why* (the user-visible problem), *what* (the technical change), *what was tested* (test names + the manual n8n verification + the loomcycle version it was verified against).
10. **Human review** — wait for the user. Do not self-merge. Address review comments in additional commits on the same branch (don't force-push unless the user asks).
11. **Merge** — squash to `main` after approval, with the PR title as the commit subject and the PR body as the commit body. Tag if it's an npm release.
12. **Publish** — for npm releases, `npm publish` only after `main` is green and tagged. Coordinate with loomcycle wire-API versioning (see "Cross-repo notes" below). The first publish (Sub-phase 2.6) also requires submission to the n8n community-node directory.

Skip the chain only for trivial fixes (typos, stale comment lines, obviously-correct one-liners). When in doubt, follow the chain.

## Karpathy guidelines (coding discipline)

Inherited verbatim from loomcycle. Internalise these; they apply identically to TypeScript / n8n-node code.

- **Surgical changes.** Modify the minimum surface needed to fix or add what's asked. Don't rewrite adjacent code "while you're there." Don't refactor on the same commit as a behaviour change. The smaller the diff, the easier the review.
- **Surface assumptions.** When you make a non-obvious choice, write it down in a comment or the PR body. "I assumed n8n's SSE-via-trigger framework handles reconnect on its own" is the kind of statement that prevents future surprises.
- **Verifiable success criteria.** Before writing code, write down how you'll know it works. A regression test, a screenshot of the node firing in n8n, a known input → known output — something concrete. "It compiles" is not a success criterion.
- **Avoid overcomplication.** Prefer the boring solution. The 30-line direct implementation beats a 3-line dependency. Don't introduce abstractions speculatively. For n8n nodes specifically: prefer **declarative** node descriptions for action nodes; reach for programmatic node code only when a trigger / cluster sub-node lifecycle hook requires it.
- **Don't trust your own first draft.** After writing a function, read it as if someone else wrote it. Most bugs are obvious on the second read.

## Security rules — non-negotiable

These rules apply to every interaction with this repo. Violations are bugs even when they don't produce visible failure. (Inherited from loomcycle's CLAUDE.md, adapted for n8n credentials.)

1. **Never share secrets.** API keys, bearer tokens, OAuth tokens, signing keys — never paste them into responses, tool output, log lines, or commit messages. If you need to refer to one, reference the env var name (e.g. `LOOMCYCLE_AUTH_TOKEN`) without the value.

2. **Never open or edit `.env.local` or `.env`.** These files hold credentials and are git-ignored. Reading them surfaces secrets into your context where they could be accidentally echoed. Editing them could clobber the user's working config. **Exception:** the user explicitly asks you to edit a specific line. In all other cases, when the user asks "set X env var", suggest the line they should add manually (e.g. "Add `LOOMCYCLE_AUTH_TOKEN=…` to `.env.local`") rather than reading or writing the file yourself.

3. **Ignore credentials you happen to see.** If a key appears in a log line, a tool result, a stack trace, an n8n credential JSON, a stash diff — do not echo it back, do not include it in a commit, do not reference it. Pretend you didn't see it. If you must reference it (e.g. "the `LoomCycle API` credential's `bearerToken` field is empty"), reference by field name only.

4. **Treat these env-var / credential-field name patterns as secrets:** anything matching `*_KEY`, `*_TOKEN`, `*_SECRET`, `*_AUTH`, `*_PASSWORD`, `*_CREDENTIAL`, plus n8n credential field names `bearerToken`, `apiKey`, `password`, `clientSecret`. The `LOOMCYCLE_AUTH_TOKEN` env var is the bearer used by all loomcycle `/v1/*` endpoints — never log or echo its value.

5. **Targeted git adds, never `git add .` or `git add -A`** when you have any uncertainty about what's staged. `.env*`, `*.pem`, `*.key`, n8n credential exports, generated test snapshots — these can sweep into a commit if you stage with a wildcard. Use `git add <specific paths>` and check `git status --short` before commit.

6. **n8n credentials never leave the credential boundary.** The `LoomCycleApi` credential's `bearerToken` is loaded by n8n's secure credential store. Inside our node code, treat the credential object as opaque: pass it to `@loomcycle/client` as `authToken`; never write it to `console.log`, never include it in error messages thrown back to n8n (n8n surfaces those to the operator UI), never serialise it into a request payload other than the `Authorization` header that `@loomcycle/client` constructs internally.

7. **`@loomcycle/client` is the only wire-egress point.** Do not hand-write `fetch()` or `axios` calls against `/v1/*`. Every loomcycle call goes through `@loomcycle/client` — that's where SSRF defence, bearer auth, and the constant-time token handling live. Adding our own HTTP layer would duplicate (and likely weaken) those protections.

8. **The loomcycle bearer is operator-trust.** Anyone with the `LOOMCYCLE_AUTH_TOKEN` is fully trusted to drive the runtime. n8n credentials are per-operator; do not auto-share them across workflows, do not log them in execution data, do not expose them via `LoadOptionsMethod` return values. Treat n8n's credential boundary as a hard trust boundary.

## Code conventions

- **TypeScript style:** `tsc --noEmit` clean. ESLint clean (use n8n's recommended config: `eslint-plugin-n8n-nodes-base`). `prettier` formatted. Prefer `unknown` over `any`; if you reach for `any`, justify it in a comment.
- **n8n style:** declarative `INodeTypeDescription` for action nodes wherever possible; programmatic `execute(this: IExecuteFunctions)` only when an operation needs branching logic beyond what declarative parameters express. Trigger nodes are necessarily programmatic (`ITriggerFunctions`).
- **No package-level mutable globals.** Credentials, configs, clients — pass them in as function arguments derived from `this.getCredentials()` / `this.getNodeParameter()`. n8n re-instantiates nodes per execution; module-scoped state will surprise you.
- **Error handling:** throw `NodeOperationError` / `NodeApiError` from `n8n-workflow` — they render correctly in the n8n UI. Bare `throw new Error(...)` swallows the operator's debugging context. Wrap `@loomcycle/client`'s typed error classes (`LoomcycleHttpError`, `LoomcycleAuthError`, `LoomcycleNotFoundError`, etc.) into `NodeApiError` with the loomcycle status code preserved.
- **Test naming:** `<Subject> <behaviour>` in `describe`/`it` blocks. e.g. `describe('LoomCycle: Run')` → `it('Spawn Run propagates user_tier to the wire payload')`. The behaviour describes the postcondition the test asserts, not the input.
- **Commit messages:** subject ≤ 72 chars in imperative mood (`fix(run): preserve user_tier on spawn`). Body explains *why* before *what*. Reference commits via short SHA when calling out a regression. Always close with the `Co-Authored-By` line if Claude wrote substantial code.
- **Comments explain WHY, not WHAT.** Code says what; comments add the missing context (the constraint, the n8n API quirk, the surprising-but-correct invariant). Don't write comments that summarise the next line.
- **No backwards-compat shims for unused code.** When deleting an operation, delete it; don't keep a "deprecated, ignored" branch. When deprecating a credential field, document the migration; don't add a "deprecated, ignored" read.

## Cross-repo notes

n8n-nodes-loomcycle, loomcycle, and `@loomcycle/client` are three coordinated repos. The coupling matters:

- **Wire-protocol changes** (HTTP request/response shape, SSE event types, new endpoints, new MCP tools) land in **loomcycle first**, then are mirrored into `@loomcycle/client` (same repo, `adapters/ts/`), THEN consumed by this repo. Never write n8n nodes against a wire surface that hasn't shipped in `@loomcycle/client` yet.
- **Versioning policy.** n8n-nodes-loomcycle follows semver. It targets the stable wire API and is compatible across multiple loomcycle minor versions (compatibility range, not strict pin). Pin `@loomcycle/client` to a minor range (`^0.11.0`) — bump deliberately when consuming a new method.
- **Coordinated releases.** Each loomcycle release that changes the wire API may require an n8n-nodes-loomcycle release. The user owns both repos; coordinate.
- **Substrate stance discipline.** Do not pull n8n features into loomcycle (no scheduler in loomcycle, no n8n-credential storage in loomcycle, no node-graph editor in loomcycle). Do not pull loomcycle features into n8n beyond what the RFC's Vector 3 scope sets (no inverse-MCP setup wizard in this package, no loomcycle yaml editor inside n8n).
- **Adapter conformance.** This package is an early production user of `@loomcycle/client`. If a needed wire op is missing a typed method on the adapter, add it to the adapter (in `~/work/loomcycle/adapters/ts/`) first — do not hand-roll the call here.
- **Upstream-gated features.** Some n8n-side features depend on substrate primitives that don't ship yet (most notably `MCPServerDef` — see the "Dynamic MCP server provisioning" section above). When a feature is upstream-gated, ship the n8n surface behind a `loomcycleVersion` capability gate that degrades gracefully on older substrates; do not stub the wire call locally.

## RFC and decision history — read these before planning

| Document | Path | Why read it |
|---|---|---|
| **n8n RFC (locked)** | `~/work/loomcycle-internal/doc-internal/rfcs/n8n-comparison.md` | The contract for this repo. Three vectors, 7 sub-phases, locked decisions table, node catalog, credential shape, auto-discovery, trigger architecture, what's deliberately NOT in scope. |
| Internal PLAN.md | `~/work/loomcycle-internal/doc-internal/PLAN.md` | Roadmap context. n8n integration is **item #1** in the v0.9.x backlog. Decision history for every locked design. |
| Loomcycle MCP RFC | `~/work/loomcycle-internal/doc-internal/rfcs/loomcycle-mcp.md` | Defines the `Connector` interface that ALL wire transports dispatch through. `@loomcycle/client` mirrors this surface in TS; our nodes inherit it. Necessary background for Vector 1 (n8n's MCP Client Tool consuming loomcycle's MCP server). |
| Loomcycle public README | `~/work/loomcycle/README.md` | What loomcycle is + the "two postures" model (sandbox vs dev). Helps frame the operator-facing language in node descriptions + README. |
| Loomcycle public PLAN | `~/work/loomcycle/docs/PLAN.md` | Public roadmap; what's shipped vs planned. Useful when a node description references a feature ("AgentDef versioning — see loomcycle v0.8.5"). |
| Loomcycle ARCHITECTURE | `~/work/loomcycle/docs/ARCHITECTURE.md` | Full request flow + concurrency model. Background reading for cluster sub-nodes (which spawn sub-agents and need to understand the parent-child cascade). |
| Loomcycle TOOLS | `~/work/loomcycle/docs/TOOLS.md` | Default-deny tool model + every built-in tool's input shape. Source of truth for operation parameter schemas in our descriptions/*.ts files. |
| `@loomcycle/client` README | `~/work/loomcycle/adapters/ts/README.md` | What methods are available. Don't reinvent. |
| `@loomcycle/client` source | `~/work/loomcycle/adapters/ts/src/` | When typing question arises, read the adapter source rather than the wire docs. |

Sibling comparison RFCs (`langchain-comparison.md`, `gbrain-comparison.md`, `openclaw-comparison.md`, `hermes-comparison.md`, `pi-comparison.md`) are **background only**; they're not actionable from this repo. Read them only if a strategic-positioning question arises.

## Cross-cutting design constants

- **Substrate stance.** loomcycle is the substrate; n8n is the design surface. This repo is the glue. Don't add features that move either project off-stance.
- **Wire-API surface = `@loomcycle/client`.** Treat the adapter as the source of truth. If something isn't on the adapter, it doesn't exist for this package.
- **Credential boundary = trust boundary.** n8n's credential store is the only place credentials live.
- **Default to declarative.** n8n declarative nodes for everything except triggers + cluster sub-nodes.
- **Five canonical workflow templates** drive Sub-phase 2.5; each demonstrates one composition pattern (RFC §"Track C.2"). They serve as living integration tests and as marketing material for Tier C.

## When in doubt

- **Look at recent commits on `main`** (`git log --oneline -20`) for the style of recent changes. (Today: empty. Will start mattering after Sub-phase 2.0 lands.)
- **Read the RFC** (`~/work/loomcycle-internal/doc-internal/rfcs/n8n-comparison.md`) before introducing a pattern not covered by the locked decisions table.
- **Check `@loomcycle/client`'s method list** before writing any new wire call. Add to the adapter if needed; don't bypass it.
- **Run a real n8n locally** before claiming a node works. The harness can lint; only a live n8n proves the node renders + executes.
- **Ask the user.** A 30-second clarification beats an hour of speculative refactor.
