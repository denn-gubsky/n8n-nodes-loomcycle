# Example workflows

Six importable n8n workflows that demonstrate canonical loomcycle composition patterns. Each is a self-contained `.json` you can import via **n8n → Workflows → Import from File**.

| # | File | Demonstrates |
|---|---|---|
| 01 | [`01-multi-agent-research.json`](./01-multi-agent-research.json) | Two loomcycle agents chained (researcher → summariser) + channel-published digest |
| 02 | [`02-slack-loomcycle-slack.json`](./02-slack-loomcycle-slack.json) | Slack mention → loomcycle agent → Slack reply |
| 03 | [`03-daily-activity-report.json`](./03-daily-activity-report.json) | Cron-driven daily run report via `listUserAgents` + JS aggregation + email |
| 04 | [`04-n8n-as-loomcycle-tool.json`](./04-n8n-as-loomcycle-tool.json) | **Vector 2 RFC pattern** — n8n workflow exposed as an MCP server consumed by loomcycle agents |
| 05 | [`05-ai-agent-with-loomcycle-memory.json`](./05-ai-agent-with-loomcycle-memory.json) | n8n AI Agent with `LoomCycleMemoryTool` + `LoomCycleSubAgentTool` |
| 06 | [`06-dynamic-mcp-provisioning.json`](./06-dynamic-mcp-provisioning.json) | **Crown jewel** — drag MCP into n8n canvas + agent auto-provisions in loomcycle substrate |

## Prerequisites

All examples require:

- A running loomcycle deployment (≥ v0.9.2 for examples #06, ≥ v0.9.2 for any with substrate-admin ops, ≥ v0.8.x for the basic Run/Memory/Channel ops)
- The `LoomCycle API` credential configured in n8n with the deployment's `bearerToken` + `baseUrl`
- Optional but recommended: set `userId` + `userTier` defaults on the credential so per-node fields can stay empty

Example-specific extras are listed inline below.

---

## 01 — Multi-Agent Research

**Pattern:** sequential agent hand-off via local n8n state (no channel/memory persistence between nodes; the second agent reads the first's `finalText` directly).

**Flow:** Manual Trigger → "Set Query" → `LoomCycle Researcher` (spawn researcher agent) → `LoomCycle Summariser` (spawn summariser, prompt = researcher's output) → `Channel Publish` (broadcast summary to the `research-digests` channel).

**You need:**
- Loomcycle agents named `researcher` and `summariser` (declared in `loomcycle.yaml` or via dynamic `AgentDef.create`).
- A loomcycle channel named `research-digests` (declared in `loomcycle.yaml`'s `channels:` block).

**Try it:**
1. Import the workflow into n8n.
2. Wire your LoomCycle API credential into each LoomCycle node.
3. Adjust the query string in "Set Query".
4. Click **Execute Workflow**.

---

## 02 — Slack → LoomCycle → Slack

**Pattern:** event-driven conversational assistant. n8n owns the Slack transport; loomcycle owns the reasoning.

**Flow:** Slack message trigger → `LoomCycle: Respond` (spawn `slack-assistant` agent with a per-channel-per-user session_id so the agent remembers context) → `Slack: Post Reply`.

**You need:**
- A Slack bot user added to the target channel.
- A loomcycle agent named `slack-assistant`.
- Env vars in n8n: `SLACK_CHANNEL_ID`.

---

## 03 — Daily LoomCycle Activity Report

**Pattern:** scheduled health report. Two `LoomCycle: List Agents` calls (one for completed, one for failed) fan into a JavaScript code node that aggregates by agent name, then emails the summary.

**Flow:** Schedule (daily 09:00) → parallel `listAgents(status=completed)` + `listAgents(status=failed)` → Code aggregation → Email Send.

**You need:**
- Env vars in n8n: `LOOMCYCLE_USER_ID`, `REPORT_EMAIL`.
- SMTP credentials in n8n.

**Note:** This example deliberately uses `listAgents` rather than the loomcycle `Evaluation` tool — the Evaluation admin endpoint isn't exposed on the TS adapter yet (see [`docs/IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md) §"Deferred"). When `client.evaluation()` lands, a richer evaluation-aggregate report can replace this one.

---

## 04 — n8n as a LoomCycle Tool (Vector 2)

**Pattern:** the inverse direction — a loomcycle agent calls an n8n workflow as a tool. n8n's MCP Server Trigger exposes the workflow as an MCP server endpoint; loomcycle's agent declares `mcp__n8n-mailgun__send` in its `allowed_tools`.

**Flow:** MCP Server Trigger (`/loomcycle-mailgun`) → Mailgun Send → Respond with `{ok: true, message_id: ...}`.

**You need:**
- Mailgun credentials in n8n.
- Loomcycle-side configuration to register the MCP server. Two options:
  - **Static:** add it to `loomcycle.yaml`'s `mcp_servers:` block with the n8n MCP Trigger URL.
  - **Dynamic:** use the `LoomCycle: MCP Server` action node (resource: `mcpServerDef`, operation: `Register`) — see Sub-phase 2.2.

This pattern is how loomcycle gains access to n8n's 400+ integrations without bloating its own substrate (RFC §"Vector 2").

---

## 05 — n8n AI Agent with LoomCycle Memory + Sub-Agent

**Pattern:** the n8n AI Agent is the conversational front-end; loomcycle does the heavy lifting via cluster sub-node tools.

**Flow:** Chat trigger → n8n AI Agent (OpenAI model) with two cluster sub-node tools attached:
- `loomcycle_memory` — for cross-conversation state (Memory list/get operations)
- `loomcycle_research` — for deep questions (delegates to a loomcycle `researcher` agent)

**You need:**
- OpenAI API credentials in n8n.
- A loomcycle agent named `researcher`.

This demonstrates the cluster-sub-node pattern from Sub-phase 2.4. The agent on the n8n side never sees loomcycle directly — it just sees two well-named tools.

---

## 06 — Dynamic MCP Provisioning (Crown Jewel)

**Pattern:** drag an MCP server config onto the n8n canvas → loomcycle's substrate auto-registers it (idempotent ensure: `get` → `create` on `NotFoundError`) → the AI Agent's tool delegates to a loomcycle agent that has access to that MCP server.

**Flow:** Chat trigger → AI Agent (OpenAI) → `LoomCycle MCP Server: Slack` cluster sub-node.

When the workflow runs for the first time:
1. The sub-node's `supplyData` calls `mcpServerDef({op: 'get', name: 'slack-mcp'})`.
2. On `NotFoundError`, it calls `mcpServerDef({op: 'create', name: 'slack-mcp', transport: 'streamable-http', url: ..., headers: { Authorization: 'Bearer ${LOOMCYCLE_SLACK_TOKEN}' }, promote: true})`.
3. Returns a tool the AI Agent can call (`post_to_slack`); on invocation, spawns a loomcycle `slack-poster` agent with `allowed_tools: ['mcp__slack-mcp__*']`.

Subsequent workflow runs hit the `get` branch and skip `create` — no churn.

**You need:**
- **Loomcycle ≥ v0.9.2** (PR #177 substrate-side `MCPServerDef`).
- A loomcycle agent named `slack-poster`.
- Env var on the **loomcycle deployment**: `LOOMCYCLE_SLACK_TOKEN` (the bearer for the Slack MCP server). The n8n side carries only the template string `${LOOMCYCLE_SLACK_TOKEN}` — plaintext credentials never traverse this wire path.
- A reachable Slack MCP server (e.g. `https://mcp.slack.example/v1`) whose hostname is allowlisted in loomcycle's `LOOMCYCLE_HTTP_HOST_ALLOWLIST` (SSRF defence at the substrate's registration boundary).

**Lifecycle:** `cleanupOnEnd: false` (default). Registrations persist across workflow executions so multiple agentic teams share stable MCP fleets without churn. Toggle the parameter to `true` if you want per-execution-scoped registrations (e.g. for ephemeral test teams).

---

## Importing into n8n

1. In n8n, navigate to **Workflows → Add workflow → Import from File**.
2. Select one of the `.json` files in this directory.
3. After import, click each LoomCycle node and (re)select the credential — credential IDs in the JSON are placeholders (`loomcycle-creds`, `slack-creds`, etc.).
4. Adjust environment-variable references (`={{ $env.SLACK_CHANNEL_ID }}` etc.) to match your deployment.
5. **Save** then **Execute** (or activate for trigger-driven workflows).

## Running examples locally for development

```bash
# In this package:
npm link

# In a local n8n install:
npm link n8n-nodes-loomcycle
n8n start

# Then import any of the examples via the n8n UI.
```

A helper script is provided: [`scripts/import-examples.sh`](../scripts/import-examples.sh).

## Caveats

- The JSON `credentials` and `id` fields use placeholder ids. After import, you must (re)attach your actual credentials.
- The JSON `typeVersion` fields target current n8n (1.82+). Older n8n may reject some node types.
- Examples #05 and #06 use the cluster sub-nodes (Sub-phase 2.4) — these require n8n ≥ 1.82.0 for the cluster-node API.
- Example #06 requires loomcycle ≥ v0.9.2 substrate. Older loomcycle returns "endpoint unknown" on `POST /v1/_mcpserverdef`.
