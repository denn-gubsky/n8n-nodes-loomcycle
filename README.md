<p align="center">
  <img src=".github/social-preview.png" alt="n8n-nodes-loomcycle — loomcycle agentic runtime nodes for n8n" width="720">
</p>

# n8n-nodes-loomcycle-full

Community n8n nodes for the [loomcycle](https://github.com/denn-gubsky/loomcycle) agentic runtime — design and operate loomcycle agents directly from n8n's visual builder.

[![npm](https://img.shields.io/npm/v/@loomcycle/n8n-nodes-loomcycle-full)](https://www.npmjs.com/package/@loomcycle/n8n-nodes-loomcycle-full)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> ## 📦 Which package do I want?
> This is **`@loomcycle/n8n-nodes-loomcycle-full`** — the **full self-hosted edition** (24 nodes), including the langchain-based **AI-Agent Tool sub-nodes** (Memory / Channel / Sub-Agent / MCP Server Tool), **SSE-push** triggers, and the Run **Wait for Completion** op.
> - **It is NOT n8n-Cloud-verified** and won't pass n8n's community-node scanner (it depends on `@langchain/core` and uses timers/SSE, which Cloud disallows). **Install it manually on self-hosted n8n.**
> - If you're on **n8n Cloud** or want the verified node, use the slim **[`@loomcycle/n8n-nodes-loomcycle`](https://www.npmjs.com/package/@loomcycle/n8n-nodes-loomcycle)** (20 nodes; zero deps; poll-based triggers; Chat Model on `@n8n/ai-node-sdk`).
> - Both are built from this repo: the slim package from `main`, this full edition from the long-lived [`full-edition`](https://github.com/denn-gubsky/n8n-nodes-loomcycle/tree/full-edition) branch.

This package realises **Phase 2 / Vector 3** of the [loomcycle ↔ n8n integration RFC](https://github.com/denn-gubsky/loomcycle-internal/blob/main/doc-internal/rfcs/n8n-comparison.md): custom n8n nodes that let operators drive loomcycle from the n8n canvas, while loomcycle stays the agentic runtime substrate.

## Requirements

These nodes are a thin n8n-shaped wrapper over loomcycle's wire API — they **call your loomcycle deployment**, they don't run an agent runtime inside n8n. So you need:

- **A reachable loomcycle deployment + a bearer token** (loomcycle's `LOOMCYCLE_AUTH_TOKEN`). Every node call goes out to the Base URL on the **LoomCycle API** credential.
  - **Self-hosted n8n:** loomcycle can sit on `localhost` / your LAN (e.g. `http://127.0.0.1:8787`).
  - **n8n Cloud:** loomcycle must be reachable from the public internet — a public HTTPS URL or a tunnel (Cloudflare Tunnel, ngrok, …) — because n8n Cloud makes the outbound call from its own network, not yours.
- **loomcycle ≥ v0.9.2** for the substrate-admin ops (AgentDef / SkillDef / MCP Server); **≥ v0.12.x** for the Schedule node and per-tool credentials. Basic Run / Memory / Channel ops work on older builds.
- **n8n ≥ 1.82** (the package targets `n8n-workflow` ≥ 1.82).

## Quick install

```bash
# Self-hosted n8n → Settings → Community Nodes → Install:
@loomcycle/n8n-nodes-loomcycle-full
```

Once installed, configure the **LoomCycle API** credential with your loomcycle deployment's bearer token + base URL.

The package lives under the [`@loomcycle`](https://www.npmjs.com/org/loomcycle) npm org alongside [`@loomcycle/client`](https://www.npmjs.com/package/@loomcycle/client) — same trust boundary, same maintainer.

## What's in the box

Thirty-nine nodes (27 action + 4 trigger + 8 cluster sub-nodes) plus one credential type.

### Credential

- **LoomCycle API** — bearer token + base URL + optional Default User ID / User Tier / MCP URL. The credential test calls `GET /v1/_me` (whoami) to validate the bearer resolves to a principal (tenant + scopes) — requires loomcycle ≥ v0.17. Under v0.17's multi-tenant authorization (RFC L), the bearer is a tenant-scoped `OperatorTokenDef` token; provision it with the scopes your workflow's operations need.

### Action nodes

As of **2.0.0** the former single multi-resource umbrella node is split into **dedicated action nodes**, each with its own canvas icon (n8n renders one icon per node type — separate nodes are the only way to give each entity a distinct glyph). They all share one credential and one wire client; they are drag-and-drop separate in the node picker.

- **LoomCycle Run** — `Spawn` / `Spawn Batch` / `Send Input` / `Get Status` / `Get Transcript` / `Compact` / `Wait for Completion` / `Cancel` / `Cancel Turn` / `Replay Session` / `List Agents` / `List Runnable Agents`. Spawn-time **Sampling** / **Compaction** / **Run Timeout** overrides live under *Additional Fields*. `Spawn Batch` fans out up to 32 runs (loomcycle ≥ v0.33); `Compact` summarises a parked run's context (≥ v0.33). The full edition keeps the in-node **Wait for Completion** op (the slim edition cannot — n8n Cloud's scanner bans the timer primitives it needs). For **interactive runs** (≥ v1.1.1), enable *Additional Fields → Interactive Session* on `Spawn` — the node returns the `run_id` once the run parks at `end_turn`; steer it with `Send Input`. `Cancel Turn` stops the in-flight turn and parks the run without terminating it (RFC BH, ≥ v1.22); `Replay Session` replays a transcript into a new session on another agent (RFC BJ, ≥ v1.25); `List Runnable Agents` is the member-token-safe agent listing (RFC BY, ≥ v1.51). Spawn also accepts **image input** via *Additional Fields → Image Binary Properties* (RFC AT, ≥ v1.7) and reports token-budget crossings as a `limits[]` array (RFC AW, ≥ v1.11).
  - **Run controls (loomcycle v1.82–v1.113)** under *Additional Fields*: per-run **Model** / **Provider** / **Tier** / **Effort** / **Max Tokens** / **Max Iterations** (each only within what the agent definition allows; anything else is refused, never dropped), **Output Schema** (the parsed answer comes back as `structured`), **Tool Choice**, **Hold for Review**, **Idempotency Key** (a retried spawn returns the first run, `deduplicated: true`), **Max Wall Time**, **Context Mode**, **Max Context Tokens**, **Hooks** (HookDef names added to this run, each under its own event) and **No Trace**.
  - **New operations:** `Get Run` (by run_id, with `result` and the settings it ran with), `List Children`, `Review` (approve, or reject with feedback to make it revise), `Retune` (change a live or parked run's settings without a turn), `Get Run Config` (its overrides, every setting with its source, or the first prompt it received), `Delete Run Tree` (needs `runs:delete`), and **drafts** — `Create Draft` / `Update Draft` / `Start Draft` / `Delete Draft`: validate a run now, start it later.
- **LoomCycle Memory** — `Get Entry` / `List Entries` / `List Scope IDs` / `List Scopes` / `Set Entry` / `Delete Entry` / `Search` / `Embed Stats` / `Reembed` / `Backfill Embeddings` / `Purge Stale Embeddings`. `Search` (RFC BV/BW, ≥ v1.47) returns one ranked list spanning k/v entries **and** document-chunk bodies, each hit tagged `fact` / `note` / `document`. The three embedding-maintenance ops are **dry-run by default** behind an explicit *Commit* toggle — `Purge Stale Embeddings` deletes. (Per-tool credentials `userCredentials` map on Spawn require loomcycle ≥ v0.12.x.)
  - **Search → Said After / Said Before** filter by when something was observed (loomcycle ≥ v1.66), and **True At** keeps only facts that were true at that instant.
- **LoomCycle Channel** — `Publish` / `Subscribe` / `Peek` / `Ack` / `Await` / `Broadcast` / `List Channels` / `Create Channel` / `Update Channel` / `Delete Channel` / `Purge Channel` / `Release`. `Await` (fan-in) waits on a predicate across channels and `Broadcast` (fan-out) publishes to many atomically (loomcycle ≥ v0.25); yaml-declared channels remain immutable (but `Purge` is allowed on them).
  - **Held channels** (loomcycle ≥ v1.77): *Hold Messages* stores what is published without delivering it, and **Release** hands over the oldest N. *Publish Hooks* (v1.99, `LOOMCYCLE_CHANNEL_HOOKS=1`) attach `channel_publish` HookDefs that release, rewrite, drop or hold each message.
- **LoomCycle Agent Definition** — `Create` / `Fork` / `Get` / `List Versions` / `Promote` / `Retire` / `Verify` (content_sha256 round-trip). Create/Fork expose a **Provider** dropdown read live from `GET /v1/config` (≥ v1.38) and folded into the overlay; it always offers the unset default plus the synthetic **Code-JS** provider, which authors a [deterministic JavaScript agent](#code-js-agents) (RFC J).
- **LoomCycle Skill Definition** — same 7 ops as AgentDef, applied to skills
- **LoomCycle MCP Server** — `Register` / `Fork` / `Promote` / `Retire` / `Get` / `List Versions` / `Rediscover` / `Verify` — dynamic MCP server registration (requires loomcycle ≥ v0.9.2)
- **LoomCycle Schedule** — `Create` / `Fork` / `Get` / `List Versions` / `Retire` / `List All` / `Get State` / `Run Now` / `Pause` / `Resume` — substrate-native scheduled runs (RFC E; requires loomcycle ≥ v0.12.x). Fired runs land on the **Run Completed** trigger.
  - **Each Fire** (loomcycle ≥ v1.77 / v1.104) runs an agent, **publishes to a channel**, or **starts a team walk** with literal variables and an input. *Concurrency Policy* (v1.105) chooses what an overlapping slot does: *forbid* (the default) skips it, *allow* starts another, *replace* cancels the running one. A channel schedule starts no run, so it takes no policy. The runtime ops read a schedule's state and fire, pause or resume it by def_id (v1.113).
- **LoomCycle Hook** — `Create` / `Fork` / `Get` / `List Names` / `List Versions` / `Promote` / `Retire` / `Verify` / `Delete` — reusable, versioned **hook definitions** (HookDef, RFC DK; requires loomcycle ≥ v1.96). A hook gates tool calls (`pre` / `post` / `post_failure`), the run itself (`agent_start` / `agent_stop` / `subagent_*` / `pre_compact`, …) or a channel's messages (`channel_publish`), with a webhook or code-js body. It fires on nothing by itself: an agent definition, a team state or a run names it. **Create** registers a new version only when the definition changed, so a re-run workflow doesn't pile up identical versions. A webhook body can be **signed** (Signing Credential, loomcycle ≥ v1.113). *loomcycle v1.97 removed the old global registration API, so the former `Register` / `List` / `Delete` operations are gone.*
- **LoomCycle Webhook** — `Create` / `Fork` / `Get` / `List Versions` / `Retire` — **inbound** webhook endpoints (RFC H; requires loomcycle ≥ v0.14.x): an external POST to a loomcycle-hosted endpoint spawns an agent run / publishes to a channel. (Distinct from **Hook** above, which is outbound.)
  - **Each Delivery** runs an agent, publishes to a channel, or starts a team walk (v1.104), with team variables taken from the body by JSONPath. **Verification** takes a stored credential (`$cred:<name>`, v1.113), a method, a forge **provider** and an **events** filter. *Before v3.5.0 a channel webhook could not be created from this node*: it sent the channel without `delivery: channel`, which loomcycle refuses.
- **LoomCycle A2A Agent** — `Create` / `Fork` / `Get` / `List Versions` / `Retire` — register **external** A2A (Agent2Agent) agents loomcycle can call as tools (RFC G; requires loomcycle ≥ v0.14.x).
- **LoomCycle A2A Server Card** — `Create` / `Fork` / `Get` / `List Versions` / `Retire` — manage the agent card loomcycle **publishes** to expose its own agents to external A2A clients (RFC G; requires loomcycle ≥ v0.14.x).
- **LoomCycle Interruption** — `List for User` / `List for Run` / `Resolve` / `Decline` — [human-in-the-loop](#human-in-the-loop) over `Interruption.ask`: list pending agent questions and post a human's answer back to unblock the parked run. `Decline` (RFC BH P2, ≥ v1.22) refuses to answer without killing the run — the agent's Question tool returns a non-error "declined" and it continues. (Requires loomcycle's consumer-MCP interruption backend.)
- **LoomCycle LLM** — `Chat` / `Embeddings` — direct calls to loomcycle's LLM gateway (`POST /v1/_llm/*`) as a workflow step: provider routing + auth + retry handled substrate-side, no agent loop. For RAG / embedding pipelines. (Distinct from the **Chat Model** sub-node, which feeds an AI Agent.)
- **LoomCycle Memory Backend** — `Create` / `Fork` / `Get` / `List Versions` / `Retire` — versioned memory-backend definitions (in-process or external REST store + ranker) that agents' Memory tool dispatches to (RFC I; requires loomcycle ≥ v0.15).
- **LoomCycle Operator Token** — `Get` / `List` / `Retire` — operator-token lifecycle (RFC L; requires loomcycle ≥ v0.17). **Mint + rotate are intentionally NOT here** — those return the token secret, which must not enter n8n execution data; do them via the loomcycle Web UI / CLI.
- **LoomCycle Snapshot** — `Create` / `List` / `Get` / `Restore` / `Delete` / `Export URL` / `Pause Runtime` / `Resume Runtime` / `Get Runtime State` / `Resolve Probe` — runtime snapshot backup + restore (loomcycle ≥ v0.8.17): snapshot before a deploy, restore on rollback. Restore accepts a stored snapshot ID or an inline envelope; Export URL returns a bearer-authed download link.
- **LoomCycle Volume** — `Create` / `Get` / `List` / `List Ephemeral` / `Delete` / `Purge` — filesystem Volumes (RFC AH; requires loomcycle ≥ v1.1). Provision named ro/rw filesystem roots for agents (the runtime derives the on-disk path); since v1.1 a Volume is the only way an agent gets filesystem access. `Delete` unmaps but keeps the files; `Purge` removes the tree.
- **LoomCycle Path** — `Resolve` / `List` / `Stat` / `Make Directory` / `Move` / `Remove` — the Path VFS (RFC AL; requires loomcycle ≥ v1.4): a Unix-like filesystem naming Memory entries / Volume mounts / Documents by human-readable path (e.g. `/docs/launch`). Scope (agent / user / tenant) resolves server-side from the bearer.
  - **List** pages with *Page Size* and *Cursor* (loomcycle ≥ v1.76).
- **LoomCycle Document** — 36 ops over the chunked-graph Document store (RFC AK + BS / BO / CE; requires loomcycle ≥ v1.4 **and SQL Memory**). Document + chunk lifecycle, edges and discovery, tags, types, `Query Chunks` (structured filters, `Under Path`, or a validator-gated read-only SQL escape hatch), per-chunk `History` / `Get Version` / `Diff Revisions`, Markdown and **JSON Canvas** import-export, image assets, and peer federation.
- **LoomCycle Fact** — 10 ops over the RFC CC verified-writes tier (loomcycle ≥ v1.54). A fact stores the exact **source span** it came from and a write-time judge checks the claim against it; a failing fact is **withheld, not deleted**. Bi-temporal throughout: **Valid At** / **Invalid At** record when a fact was true in the world, and **As Of** answers as of a past instant.
- **LoomCycle Document Source** — `Create` / `Fork` / `Get` / `List Versions` / `Retire` — register a peer loomcycle instance as a document source (RFC CE; ≥ v1.54). Operator-admin only; the overlay carries `api_key_env`, a name rather than a secret.
- **LoomCycle Team** — `List` / `Get` / `Create` / `Fork` / `Promote` / `Retire` / `Verify` / `List Versions` / `Delete` / `Run` / `Cancel Walk` / `List Walk Runs` / `Get Breakpoints` / `Set Breakpoints` / `List Channels` / `Peek Channel` / `Release Channel` / `Render Diagram` — **Agent Teams** (RFC AP; requires loomcycle ≥ v1.17.1). A versioned **state-machine graph** of agent roles: states carry a handler (`agent` / `parallel` / `consolidator` / `terminal`), transitions are gated on each state's outcome. `Run` walks the graph by name (active version) or `def_id`, and bound to a **Document chunk task board** it persists `chunk.status` per transition so progress is durable and a later Run **resumes**. `Render Diagram` emits Mermaid `stateDiagram-v2`.
  - **Since loomcycle v1.77–v1.113:** a walk is a run. `Run` can start it **detached** (turn off *Wait for the Walk to Finish*) and returns its `run_id`, which `Cancel Walk`, `List Walk Runs` and the breakpoint ops take. `Run` also sets the team's **Variables**, holds chosen states' answers **for review**, arms **breakpoints**, takes an **Idempotency Key**, and can **ask a human at the iteration cap**. `Create` / `Fork` have a **Promote** toggle (Create on, Fork off by default), and `Verify` checks either a deployed version against a hash or an **unsaved graph** (every problem a save would hit, each with a JSON path). The **Team Tool** sub-node takes operator-pinned **Variables** (the model cannot set them).
- **LoomCycle Decision** — `Decide` / `List Models` — ask a loomcycle **decision model** typed questions about a piece of state (RFC EB; requires loomcycle ≥ v1.107 and a `decision:` block in its configuration): *Choice* (pick one of 2–26 options), *Yes / No*, or *Score* (a position on a 2–26-level scale, lowest first), 1–64 questions per call. Each answer comes with its probabilities, and the output adds **`values`** — one plain value per question (the chosen option, the yes probability, the score) — for an IF or Switch node. Probabilities are a judgement, not a calibrated measurement.
- **LoomCycle Evaluation** — `Submit` / `Get` / `List for Run` / `List for Definition` / `Aggregate` — record scores against runs (overall score, named dimensions, a rationale, a structured judgement) and roll them up per agent-definition version, optionally across its fork lineage (requires loomcycle ≥ v1.113). **Needs a tenant-level token** (`substrate:tenant`).
- **LoomCycle Credential** — `Create or Rotate` / `Get` / `List` / `Delete` — loomcycle's own encrypted credential store (requires loomcycle ≥ v1.113 for the typed adapter, and `LOOMCYCLE_SECRET_KEY` on the loomcycle host). The secret **value is taken from a LoomCycle Secret credential**, never a node parameter, so it is not saved in the workflow or its executions. Every output is metadata only. See [Credentials in loomcycle](#credentials-in-loomcycle).
- **LoomCycle Directory** — `List Users` / `Inspect Subject` / `List Tenants` — read-only "who is in this deployment and what is held for them" (loomcycle ≥ v1.46). `Inspect` aggregates one subject's activity, chats, memory, documents, budget and usage in one call. There is no create or update: a user here is **derived from run activity**, not stored. `List Tenants` needs an operator-admin token and refuses a tenant-scoped one outright.
- **LoomCycle Erasure** — `Report` / `Execute` — subject erasure (RFC BL P5; requires ≥ v1.45, **and `LOOMCYCLE_AUDIT_LOG_PATH` set** from v1.55). The natural home for a **GDPR data-subject-request workflow**. `Execute` is a **dry run unless you commit**, and committing requires retyping the subject. **Persist the output**: residue is traceable only through the subject's chats, which Execute deletes, so a later report shows 0 while those facts remain — the response is the only durable record.
- **LoomCycle User** — `List` / `List Tokens` / `Revoke Token` — tenant-owned users and their delegated tokens (RFC BX P2; ≥ v1.50). Reads plus one revocation by design: identity CRUD is operator work for the CLI / Web UI, while `Revoke Token` stays because cutting off a leaked credential is worth automating on an alert. Minting is absent — the bearer plaintext must not reach execution data.
- **LoomCycle Usage** — `Usage Report` / `List Limits` / `Get Config` — cost attribution (RFC AV; ≥ v1.10) and a read of per-scope budgets (RFC AW; ≥ v1.11). Group by `source` to see **which key actually paid**. Read-only: budget writes stay operator-only, and `setLimit` is a full-row upsert whose omitted tier clears that ceiling.
- **LoomCycle History** — `List` / `Get` / `Search` / `Related` / `Rename` / `Annotate` / `Pin` / `Archive` / `Recap` / `Resume` — past chats as first-class objects (RFC BE; ≥ v1.20). `Get` renders a transcript as structured events, full Markdown, or **Conversation** (turns only) — use the last when feeding a chat to a model. ⚠️ **`Search` matches the chat TITLE only**; **`Related`** is the semantic path.
  - **Search → Match: What Was Said** (loomcycle ≥ v1.80, needs an embedder) searches the chats' turns instead of their titles. **Get → Turn Paging** (v1.98) reads a long chat in pages of turns.

> **Migration from 1.x:** the umbrella `LoomCycle` node (type `loomCycle`) was removed. Workflows built on 1.x must swap each `LoomCycle` node for the matching dedicated node (e.g. a `LoomCycle` node with Resource = Memory → **LoomCycle Memory**); operations and parameters are otherwise unchanged.

### Trigger nodes

- **LoomCycle: Hook Call** — **n8n as the policy behind a loomcycle hook** (loomcycle ≥ v1.113 for signed calls). Point a HookDef's webhook URL here and the workflow decides each call — deny or rewrite a tool call, add context, keep an agent working or hold its answer for review, release or drop a channel message. Signatures are verified **fail-closed** with the LoomCycle Secret API credential, inside a replay window, and each signed delivery is accepted once. See [Hook policy in n8n](#hook-policy-in-n8n).
- **LoomCycle: Review Pending** — polls for runs whose answer is **held for review** (loomcycle ≥ v1.113), so a person can rule on it with **Run → Review**. A rejected answer that comes back revised fires again.
- **LoomCycle: Run Completed** — fires when an agent run reaches a terminal state. SSE primary with polling fallback for proxy-hostile deployments. Honours `parentAgentId` + `debug` filters from the adapter.
- **LoomCycle: Channel Message** — long-poll subscribe with two delivery modes: `auto-ack` (at-most-once) and `peek + explicit ack` (at-least-once, cursor persisted in workflow static data).
- **LoomCycle: Interrupt Pending** — poll-based: fires on new **pending interruptions** (agent questions) for a user, deduping by `interrupt_id`. Wire the output to a human channel (Slack / email / form) and feed the answer back via **LoomCycle Interruption → Resolve**.
- **LoomCycle: Change Event** — the one genuinely **event-driven** trigger (RFC CD Part C; ≥ v1.54 plus `LOOMCYCLE_MEMORY_CHANGES_ENABLED=1`). loomcycle POSTs HMAC-signed batches on every memory / document write, so no polling. Events are **value-free** — the coordinate of what changed, not the value — so follow it with Memory → Get Entry or Document → Get Chunk. Signature verification **fails closed**; delivery is at-least-once, so the node dedupes on `seq`. Subscriptions are operator-yaml only.

### Cluster sub-nodes (plug into n8n's AI Agent)

- **LoomCycle Chat Model** — plugs into the AI Agent's **Chat Model** slot. Routes the agent's LLM calls through loomcycle's gateway (`POST /v1/_llm/chat`) instead of a direct provider SDK. Single credential covers all providers; loomcycle's resolver picks provider / model at request time; per-user quota tracking; single audit log. Supports tool calling (LangChain `bindTools` → gateway's provider-agnostic schema → substrate translates per-provider). **No agent loop** — this is the thin gateway shim, not the full runtime. Use **Sub-Agent Tool** below when you want the agent loop.
- **LoomCycle Memory Tool** — exposes Memory CRUD (read + write) as a single discriminated tool the AI Agent can call. The agent can persist intermediate state between reasoning turns or across runs via `setEntry` / `deleteEntry`.
- **LoomCycle Channel Tool** — Channel publish + peek as agent tools.
- **LoomCycle Sub-Agent Tool** — delegates to a configured loomcycle agent (drains `runStreaming`); the agent receives the parent's tool-call prompt and returns its `finalText`.
- **LoomCycle MCP Server Tool** — **strategic differentiator.** Drag onto a canvas → the substrate auto-registers the MCP server via `MCPServerDef` (idempotent ensure: `get` → `create` on `NotFoundError`) → returns a tool that spawns a loomcycle agent with `allowed_tools: ['mcp__<name>__*']`. `cleanupOnEnd: false` default — registrations persist across executions for stable agentic teams.
- **LoomCycle Document Tool** — read, search and author documents from inside an agent loop. A **curated subset** of the action node's 36 ops: a tool schema is part of the model's prompt, so the destructive and administrative ops (delete, federation sync, canvas import, type definition) stay operator-only. A configurable **Default Scope** keeps writes off the shared `tenant` store by default.
- **LoomCycle Fact Tool** — record and recall verified facts, with an **Allow Writes** toggle for a read-only recall posture. Three ops are deliberately withheld: `judge_fact` (an agent ruling on its own fact collapses the substrate's integrity check into self-attestation), `supersede_chunk` (a two-ID pairing whose mistake silently rewrites history) and `propose_entity` (already inert until an operator accepts, so a tool loop just generates queue noise). `remember` **is** exposed — recording what a person just told you is exactly what a conversational agent is placed to do.
- **LoomCycle Team Tool** — delegates a whole task to a loomcycle **agent team** rather than a single sub-agent: a multi-step workflow of specialised agents handing off to each other. Two ops — `run` delegates, `describe` renders the team's graph so the model can see the workflow before committing. The team is **pinned by the operator**, matching the Sub-Agent Tool pattern — and here it closes a real escalation path: a team's states name arbitrary handler agents, so a model free to pick the team (or author one) could reach agents well outside its own tool ceiling. Authoring ops stay on the action node for the same reason.

## Configure the credential

In n8n, navigate to **Settings → Credentials → New** and pick **LoomCycle API**.

| Field | Required | Notes |
|---|---|---|
| Base URL | yes | e.g. `http://127.0.0.1:8787` |
| Bearer Token | yes | Matches loomcycle's `LOOMCYCLE_AUTH_TOKEN` env var |
| Default User ID | no | Falls through to any node where `userId` is left empty |
| Default User Tier | no | Same fall-through |
| MCP URL (optional) | no | Only needed if you reference loomcycle's MCP server from n8n's MCP Client Tool sub-node (Vector 1) |

Click **Test** → a green checkmark means the bearer authenticated. Behind the scenes: `GET /v1/_me` with `Authorization: Bearer <token>` — this resolves the token's principal (tenant + scopes), so an invalid / expired / wrong-tenant token fails the test here rather than at runtime. (Requires loomcycle ≥ v0.17.)

## Examples

Six importable workflow JSONs in [`examples/`](examples/) cover the canonical patterns:

| # | File | Pattern |
|---|---|---|
| 01 | [`01-multi-agent-research.json`](examples/01-multi-agent-research.json) | Researcher → summariser → channel digest |
| 02 | [`02-slack-loomcycle-slack.json`](examples/02-slack-loomcycle-slack.json) | Slack trigger → loomcycle agent → Slack reply |
| 03 | [`03-daily-activity-report.json`](examples/03-daily-activity-report.json) | Cron → `listAgents` → JS aggregation → email |
| 04 | [`04-n8n-as-loomcycle-tool.json`](examples/04-n8n-as-loomcycle-tool.json) | **Vector 2** — n8n workflow as MCP server consumed by loomcycle |
| 05 | [`05-ai-agent-with-loomcycle-memory.json`](examples/05-ai-agent-with-loomcycle-memory.json) | n8n AI Agent + Memory + Sub-Agent cluster tools |
| 06 | [`06-dynamic-mcp-provisioning.json`](examples/06-dynamic-mcp-provisioning.json) | **Crown jewel** — `LoomCycleMcpServerTool` auto-provisioning |

Import via **Workflows → Import from File**, then attach your LoomCycle API credential. See [`examples/README.md`](examples/README.md) for per-example prerequisites + caveats.

## Provisioning MCP servers dynamically

The `LoomCycleMcpServerTool` cluster sub-node is the package's signature feature. When the parent AI Agent invokes it:

1. **On first run:** calls `mcpServerDef({op: 'get', name})` → on `NotFoundError`, calls `mcpServerDef({op: 'create', name, transport, url, headers, promote: true})`. The substrate registers the MCP server; subsequent agent spawns can reference it as `mcp__<name>__*`. (On loomcycle ≥ v0.20 a re-register of identical content is a server-side no-op — `deduplicated: true` — so the get-first step is an optimisation, not a correctness requirement.)
2. **On subsequent runs:** the `get` succeeds; `create` is skipped. Idempotent.
3. **On invocation:** spawns the configured loomcycle agent with `allowed_tools: ['mcp__<name>__*']`. The agent has access to the MCP server's tool surface for the duration of the run.

The same registration is also available explicitly via the **LoomCycle MCP Server** action node (Register / Fork / Promote / Retire / Get / List / Rediscover / Verify) when you want to provision ahead of any Run nodes rather than lazily on first agent invocation.

**Tool auto-discovery (loomcycle ≥ v0.20).** Register/Fork run the MCP `tools/list` handshake at registration and return a `discovered` count in the node output — you see the tool surface immediately instead of waiting for first call. It's best-effort: an unreachable peer still registers and self-heals lazily. Untick **Discover Tools at Registration** (action node) to register connection metadata only.

**A create-time check to know about (v0.20):** the URL host is validated against the allowlist *at registration* (a loopback / RFC1918 callback host must be in the **private** host allowlist, not just the general one).

### Credentials in loomcycle

Secrets that loomcycle itself must use (an MCP server's token, a hook's signing key) live in **loomcycle's credential store**, encrypted, and are referenced by name as `$cred:<name>`. They are resolved per call, agent > user > tenant, and their value is never returned by any API.

1. In n8n, create a **LoomCycle Secret API** credential holding the value.
2. Run **LoomCycle Credential → Create or Rotate** with that credential, a name and a scope. The value goes to loomcycle once. Re-run it to rotate.
3. Reference it as `$cred:<name>` in MCP server headers (including the MCP Server Tool sub-node), hook headers, a hook's **Signing Credential**, or per-tool credentials.

*Send It To* sets where loomcycle may send the value:
- **anywhere** (the default; on a rotate, the existing restriction is kept);
- **only under these https URLs**;
- **nowhere**, a compare-only value. A compare-only credential cannot sign hook deliveries.

*Expires At* makes loomcycle refuse the credential everywhere after that moment.

### Secrets in headers: `$cred:<name>`

The Headers field takes **references**, never a secret. Store the secret once in loomcycle as a credential and reference it by name:

```
Authorization: Bearer $cred:slack-token
```

loomcycle resolves `$cred:<name>` on every call (agent > user > tenant credential), so nothing secret travels from n8n to loomcycle and nothing has to be copied into loomcycle's environment.

**`${LOOMCYCLE_*}` env references are now admin-only.** From loomcycle **v1.113** a runtime MCP server definition holding `${NAME}` is refused when an agent dials it, unless an **admin** token saved it. So with a tenant or user token, `$cred:` is the only form that works; with an admin token the old env form still works, but the env var must exist on the loomcycle host *before* you register (the discovery handshake expands it). Operators can restore the old behaviour temporarily with `LOOMCYCLE_MCP_REFUSE_UNATTRIBUTED_ENV=0`. The MCP Server Tool sub-node logs any env references it registers, as a reminder of that condition.

## Code-JS agents

[code-js](https://github.com/denn-gubsky/loomcycle) (RFC J) is a loomcycle **synthetic provider**: the agent runs deterministic JavaScript instead of an LLM — replayable, no model cost. A code-js agent is just an Agent Definition with `provider: code-js` (and no model), spawned through the normal **LoomCycle Run** → **Run Completed** lifecycle. No dedicated node is needed.

**Author it inline from n8n** (loomcycle ≥ **v0.20**): on **LoomCycle Agent Definition → Create** (or **Fork**), pick **Code-JS** in the Provider dropdown and write the source in the **JavaScript Code** editor that appears. The node folds it into the overlay as `code_body`; loomcycle compiles + content-hashes it at registration. No host filesystem access needed — the code travels the wire like any other definition field.

One host prerequisite: enable the provider with `LOOMCYCLE_CODE_AGENTS_ENABLED=1` (default off — operator-trust, same posture as the Bash tool; or registration is refused). Inline source is capped at ~256 KB. For reproducible runs, optionally `LOOMCYCLE_CODE_AGENTS_DETERMINISTIC=1`.

> **Filesystem fallback (still supported):** leave the JavaScript Code editor empty and loomcycle falls back to `agent_code/<name>/index.js` (under `LOOMCYCLE_CODE_AGENTS_ROOT`) on the host, where `<name>` matches the Agent Definition name. Inline `code_body` wins when both are present.

## Passing metadata to agents

loomcycle ≥ **v0.21** adds a **non-secret metadata channel** to the agent. A code-js agent reads it as `input.metadata`; an LLM agent receives it as a trusted prompt block. It's for context, not secrets (metadata is safe to log) — keep tokens in the credentials fields. Three entry points, all surfaced as a **Metadata (JSON)** field:

- **LoomCycle Run → Spawn** — `Metadata (JSON)` under *Additional Fields*. Per-call and trusted (first-party bearer); not inherited by a continuation.
- **LoomCycle Schedule → Create / Fork** — static `Metadata (JSON)`, delivered on every scheduled fire. Override it per fork for the canonical "one template, a different `repo` per tenant" pattern.
- **LoomCycle Webhook → Create / Fork** — two channels:
  - **Static** `Metadata (JSON)` — operator-authored, delivered **trusted**.
  - **Request-sourced** — add `payload_mapping` entries with `run_metadata.<name>` targets in the *Advanced Overlay* (e.g. `{"run_metadata.repo": "$.repository.full_name"}`). These are projected from the inbound POST body and delivered **untrusted** (fenced in a `<run_metadata>` block for LLMs, `input.payload_metadata` for code-js).

The Webhook node also gains **Per-Delivery Credentials** (template strings → `user_credentials`), reaching parity with the Schedule node's per-fire credentials.

## Human-in-the-loop

A loomcycle agent can call **`Interruption.ask`** to pause and ask a human a question (optionally with a fixed set of options). n8n is the natural place to answer it — and the **LoomCycle: Interrupt Pending** trigger + **LoomCycle Interruption** node close the loop end-to-end:

1. **Interrupt Pending trigger** fires when a new pending ask appears for a user (`listUserInterrupts`, deduped by `interrupt_id`). Each item carries `run_id`, `interrupt_id`, `question`, and any `options`.
2. **Route it to a human** — a Slack message, an email, an n8n Form, an approval step.
3. **LoomCycle Interruption → Resolve** posts the human's `answer` back (`resolveInterrupt(run_id, interrupt_id)`). The parked agent unblocks and continues. When the ask declared options, the answer must be one of them (validated server-side).

> Requires loomcycle's **consumer-MCP interruption backend** so an external resolver is accepted (set in the deployment's yaml). Without it, asks are answered through loomcycle's own Web UI / CLI instead.

### Review holds: approve an answer before it counts

The other direction: the agent has *finished*, and a person decides whether its answer stands (RFC DJ, loomcycle ≥ v1.93).

1. **Spawn** with *Additional Fields → Hold for Review* (or attach an `agent_stop` hook that answers `hold`). The run finishes its answer and is **held**; Spawn returns at once with `awaitingReview: { expiresAt, round }` and the `runId`. (*Wait for Completion* on a held run keeps waiting until it is ruled on.)
2. **LoomCycle: Review Pending** fires for each held run (or carry the `runId` straight from the Spawn output).
3. **Run → Review**: *Approve* completes the run with the held answer. *Reject* with feedback sends the feedback back as its next turn, and the run revises and is held again. *Reject* without feedback ends it as `rejected`, which the **Run Completed** trigger can catch.

A hold nobody rules on before `expiresAt` ends the run as `rejected` (`review_expired`) — an unreviewed answer is never approved by default. *Review Time Limit* sets the window.

## Hook policy in n8n

A loomcycle hook can ask an n8n workflow what to do. This puts the policy for agent actions on the n8n canvas.

1. **Share a secret.** Create a **LoomCycle Secret API** credential and run **LoomCycle Credential → Create or Rotate** with it, say as `n8n-hook-signing`. Leave *Send It To* on *Anywhere*, or restrict it to the trigger's https URL; a compare-only credential cannot sign.
2. **Add the trigger.** Add **LoomCycle: Hook Call** with the same credential, and copy its Production URL.
3. **Define the hook.** In **LoomCycle Hook → Create**: Body *Webhook*, URL = that Production URL, Signing Credential = `$cred:n8n-hook-signing`, the event, and *Fail Mode*.
4. **Attach it.** Name the hook in an agent definition, on a team state, or on one run (**Run → Spawn → Hooks**).
5. **Answer.** By default the last node's first item is the answer: `{}` allows, `{"deny": {"text": "…"}}` blocks a tool call, `{"decision": "deny", "reason": "…"}` stops a run before it starts, `{"decision": "hold", …}` on `agent_stop` holds the answer for review, and `{"additional_context": "…"}` adds guidance.

Answer within the hook's timeout: 5 s by default, 60 s at most.

## Local development install

Want to install from the local checkout for development?

```bash
# In this package:
git clone https://github.com/denn-gubsky/n8n-nodes-loomcycle.git
cd n8n-nodes-loomcycle
npm install
npm run build
npm link

# In your n8n install (e.g. ~/.n8n/nodes):
cd ~/.n8n/nodes
npm link @loomcycle/n8n-nodes-loomcycle-full

# Then restart n8n. The 24 nodes appear under the "LoomCycle" prefix in
# the node picker.
```

## Compatibility

### Loomcycle version compatibility

| Feature | Min loomcycle | Notes |
|---|---|---|
| Run / Memory (read) / basic Channel | v0.8.x | Substrate stability since v0.8.4 |
| Channel CRUD (publish / subscribe / peek / ack) | **v0.9.2** | PR #180 on the substrate |
| AgentDef + SkillDef substrate-admin ops | v0.8.22 | PR #163 |
| `content_sha256` Verify op | v0.9.x | PR #175 |
| **MCPServerDef substrate** (dynamic MCP) | **v0.9.2** | PR #177; required by `LoomCycleMcpServerTool` |
| `parentAgentId` filter + `debug` toggle on streams | v0.9.2 | PR #181 |
| **LLM Gateway (`POST /v1/_llm/chat`)** powering `LoomCycle Chat Model` + `LoomCycle LLM` | **v0.10.x / v0.11** | Chat Model sub-node + LLM action node (Chat / Embeddings) |
| Per-tool credentials (RFC F) + Schedule (RFC E) | **v0.12.x** | Schedule action node |
| Inbound Webhooks (RFC H) + A2A (RFC G) | **v0.14.x** | Webhook + A2A Agent / A2A Server Card action nodes |
| Memory Backend (RFC I) | **v0.15** | Memory Backend action node |
| Interruption (human-in-the-loop) | **v0.8.16** | Interruption node + Interrupt Pending trigger; resolve needs the consumer-MCP backend |
| Snapshot backup / restore | **v0.8.17** | Snapshot action node |
| Operator Token (RFC L multi-tenant auth) | **v0.17** | Operator Token node (get/list/retire); `/v1/_me` credential test |
| Inline code-js `code_body` + MCP tool auto-discovery | **v0.20** | Agent Definition JS editor; MCP Server discover toggle |
| Non-secret metadata channel | **v0.21** | Metadata (JSON) on Run / Schedule / Webhook |
| Channel fan-in / fan-out (RFC S) | **v0.25** | Channel Await / Broadcast |
| Per-run sampling override | **v0.28** | Run → Spawn → Sampling (JSON) |
| Per-run / mid-run compaction | **v0.32** | Run → Spawn → Compaction (JSON); Run → Compact |
| Batch spawn (RFC Y) | **v0.33** | Run → Spawn Batch |
| Review holds (RFC DJ) — `rejected` status | **v1.93** | Run Completed trigger's *Rejected* status; Spawn reports `awaitingReview` |
| **Hook definitions** (HookDef, RFC DK) | **v1.96** | Hook node. The old `Register` / `List` / `Delete` API was removed upstream in v1.97 |
| Idempotent spawns (`deduplicated`) | **v1.106** | Spawn reports `deduplicated: true` |
| Signed hook deliveries · scope-naming 403s · `$cred:`-only MCP headers for non-admins | **v1.113** | Hook → Signing Credential; errors name the missing scope |
| Per-run model / limits overrides · Retune, Get Run Config · Context Mode | **v1.82 · v1.83 · v1.70** | Run → Spawn fields, Retune, Get Run Config |
| Drafts (configured runs), output schema, tool choice | **v1.92 – v1.93** | Run → Create / Update / Start / Delete Draft; Output Schema; Tool Choice |
| Idempotency key, max wall time | **v1.106** | Run → Spawn |
| Run-tree delete, child-run listing, No Trace | **v1.111 – v1.112** | Run → Delete Run Tree, List Children; Spawn → No Trace |
| Review Pending trigger (`awaited_state` filter), model dropdown | **v1.113** | LoomCycle: Review Pending; Spawn → Model |
| Team walk is a run (detach, cancel, walk runs, breakpoints) · team variables · team channels | **v1.77 · v1.104 · v1.108** | Team → Run options, Cancel Walk, List Walk Runs, Get / Set Breakpoints, List / Peek / Release Channel; Team Tool → Variables |
| Team Promote / Retire / Verify · verify an unsaved graph · fork-with-promote, ask at cap | **v1.77 · v1.105 · v1.113** | Team node |
| **Decision models** (RFC EB) | **v1.107** | Decision node — also needs a `decision:` block (Ollama ≥ 0.35 serves the models) |
| **Evaluation over HTTP** | **v1.113** | Evaluation node — tenant-level token |
| **Credential store** (typed adapter, `expires_at` enforced) | **v1.113** | Credential node + LoomCycle Secret API credential — needs `LOOMCYCLE_SECRET_KEY` |
| Memory search time window · Path List paging · History content search · History Get paging | **v1.66 · v1.76 · v1.80 · v1.98** | Memory / Path / History |
| Held channels + Release · schedule channel delivery · channel publish hooks | **v1.77 · v1.99** | Channel; Schedule → Each Fire |
| Team delivery for schedules and webhooks · schedule overlap policy | **v1.104 · v1.105** | Schedule / Webhook |
| Schedule state / run-now / pause / resume · webhook `$cred:` verification + forge providers | **v1.113** | Schedule runtime ops; Webhook → Verification |
| **Signed hook deliveries** (`X-Loomcycle-Signature`, body `delivery_id`) | **v1.113** | LoomCycle: Hook Call trigger |
| **Agent Teams** (RFC AP) — Team node + Team Tool | **v1.17.1** | state-machine graphs of agent roles; board-bound runs resume |
| Usage + cost attribution (RFC AV) | **v1.10** | Usage → Usage Report |
| Per-scope token budgets (RFC AW) — read | **v1.11** | Usage → List Limits |
| **Subject erasure** (RFC BL P5) — Erasure node | **v1.45** | also needs `LOOMCYCLE_AUDIT_LOG_PATH` from v1.55 |
| Directory (derived users / tenants) | **v1.46** | Directory node; List Tenants is admin-only |
| **Delegated users + tokens** (RFC BX) — User node | **v1.50** | needs a persistent store (503 otherwise) |
| **Chunked-graph Documents** (RFC AK) off-run | **v1.4** | Document node + Document Tool — **also needs `LOOMCYCLE_SQLMEM_ENABLED=1`** |
| Document image assets (RFC BO) | **v1.30** | Document → Set Asset / Get Asset |
| Document tags / links / history / canvas (RFC BS) | **v1.46** | Document → Add Tags / Backlinks / History / Export Canvas |
| **Verified writes / fact tier** (RFC CC) | **v1.54** | Fact node + Fact Tool — source spans, verdicts, bi-temporal recall |
| **Remote document sources** (RFC CE) | **v1.54** | Document Source node; Document → Set Remote / Sync / Diff Remote |
| **Interactive run steering** (RFC AI) — `Run → Send Input` + Spawn's *Interactive Session* | **v1.1.1** | push operator turns into a run parked at `end_turn` |
| **Filesystem Volumes** (RFC AH) — Volume node | **v1.1** | named ro/rw filesystem roots; the only way an agent gets filesystem access since v1.1 |
| **Path VFS** (RFC AL) — Path node | **v1.4** | name Memory / Volumes / Documents by human-readable path |
| **Image / vision input** (RFC AT) | **v1.7** | Run → Spawn → Image Binary Properties; base64 only, no URL form |
| Per-scope token budgets (RFC AW) | **v1.11** | `limits[]` on the Spawn result |
| **Turn-scoped cancel + decline** (RFC BH) | **v1.22** | Run → Cancel Turn; Interruption → Decline |
| Session replay (RFC BJ P4) | **v1.25** | Run → Replay Session |
| Live provider cascade (`GET /v1/config`) | **v1.38** | Agent Definition Provider dropdown |
| Embedding maintenance | **v1.46** | Memory → Backfill / Purge Stale Embeddings |
| **Unified memory search** (RFC BV/BW) | **v1.47** | Memory → Search / Embed Stats / Reembed |
| Runnable-agent discovery (RFC BY) | **v1.51** | Run → List Runnable Agents; agent dropdown fallback |

If you're on older loomcycle, the unaffected nodes still work; the gated ones surface a clean `NodeApiError("Requires loomcycle vX.Y")`.

### n8n version compatibility

- **Minimum:** n8n `1.82.0` (cluster-node API stability threshold)
- **Tested against:** n8n `2.22.1` (self-hosted Docker)
- **Tools Agent path:** requires n8n v1.82+ (cluster sub-nodes ship both `supplyData()` and `execute()` so they work across older modes too)
- **Node.js:** ≥ 20.15

### `@loomcycle/client` pin

This package pins `@loomcycle/client` to `^1.113.0`, **bundled into the published nodes at build time** (esbuild) — so the install carries no runtime npm dependency on the adapter. The adapter tracks loomcycle's minor version; consuming a new wire method bumps the bundled version. As of v3.0.0 the package builds against the loomcycle **v1.113** adapter; v1.56–v1.113 features land progressively (see the compatibility table above). `@langchain/core` is a peer (the Tool sub-nodes + Chat Model); `n8n-workflow` is the host-provided peer.

### Verified deployments

The integration has been smoke-tested end-to-end against the following configuration:

| Surface | What was validated |
|---|---|
| **Action node — `Run → Spawn`** | Picks an agent from the library dropdown (yaml-static + dynamic AgentDef entries, source-tagged), spawns via `runStreaming`, drains the final text + usage + stopReason into the workflow output |
| **Action node — `Channel → List`** | Lists declared channels (read-only credential smoke test) |
| **Trigger — `Run Completed` (SSE)** | Workflow published → SSE held open → loomcycle pushes terminal-state events; executions land within ~10-20 ms (real push, not poll) |
| **Cluster sub-node — `Memory Tool` inside n8n AI Agent** | Anthropic Chat Model + LoomCycle Memory Tool wired to the AI Agent's Tool slot; LLM calls the tool (`op: listScopes`), receives `{scopes: [...]}`, writes a natural-language summary |
| **Network path** | TrueNAS-hosted n8n Docker → direct IP to loomcycle (Tailscale MagicDNS bypassed) → sub-20 ms SSE round-trips, sub-second tool calls |

For deployments behind reverse proxies / Cloudflare workers that strip long-lived connections, switch the `Run Completed` trigger's **Transport** parameter to `Polling` — same data, slower latency, no SSE dependency.

## Troubleshooting

### `Authentication failed` after credential test

The bearer doesn't resolve to a valid principal. Verify with `curl` against the same endpoint the credential test uses:

```bash
curl -H "Authorization: Bearer <your-token>" http://127.0.0.1:8787/v1/_me
```

Expect a principal JSON (`{"tenant_id":"…","subject":"…","scopes":[…],…}`). A `401` means the token is invalid/expired; a `404` means the deployment is older than v0.17. Under v0.17 multi-tenant auth, also check the token has the **scopes** for the operations your workflow calls — a missing scope surfaces as a `403` at runtime even though the credential test passes.

### `Channel not declared` on a Publish

The channel must exist in loomcycle's `channels:` yaml block before the publish lands. Declare it operator-side and restart loomcycle. (Dynamic channel creation isn't supported in the substrate today.)

### MCPServerDef ops return "endpoint unknown"

You're on a loomcycle older than v0.9.2 (PR #177). Upgrade the substrate.

### SSE trigger stops firing after ~30 minutes

This is the substrate's server-side stream cap. The trigger reconnects transparently — check the n8n execution log; you should see emit events resume within seconds. If your reverse proxy / Cloudflare drops long-lived connections, switch the trigger's `Transport` parameter to **Polling**.

### An agent can't reach an MCP server whose headers use `${LOOMCYCLE_*}`

From loomcycle v1.113 an env reference in a runtime MCP server definition is refused unless an admin saved it. Store the secret as a loomcycle credential and change the header to `$cred:<name>` (see [Secrets in headers](#secrets-in-headers-credname)), then register again. `LoomCycleMcpServerTool` logs the env references it registered so you can find them.

### The Hook node's `Register` operation is gone

loomcycle v1.97 removed global hook registration (`POST /v1/hooks`) and dropped its table, so hooks registered that way stopped firing on upgrade. Define the hook with **Hook → Create** instead, then name it where it should apply: in an agent definition's `hooks:` (or a `tools[]` entry), on a team state, or on a single run.

### Cluster sub-nodes (`LoomCycle * Tool`) don't appear in n8n's AI Agent picker

n8n's cluster-node API stabilised at `1.82.0`. Older n8n versions won't show the sub-nodes. Upgrade n8n.

## Filing issues / contributing

- **Bug reports:** [GitHub issues](https://github.com/denn-gubsky/n8n-nodes-loomcycle/issues) — please include n8n version, loomcycle version, and a minimum reproduction (a workflow JSON you can attach).
- **Loomcycle wire-API gaps:** file against [loomcycle](https://github.com/denn-gubsky/loomcycle/issues) — this package is a thin adapter over `@loomcycle/client`.
- **Pull requests:** see [`CLAUDE.md`](CLAUDE.md) for development conventions + the 8 locked design constraints.

## License

MIT. See [`LICENSE`](LICENSE).
