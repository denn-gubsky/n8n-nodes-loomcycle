# Support matrix + breaking-change policy

## Version compatibility

| `n8n-nodes-loomcycle` | Min loomcycle | Min n8n | Min Node | Notes |
|---|---|---|---|---|
| `1.0.5` | `v0.9.3` | `1.82.0` | `20.15` | Patch — `manualTriggerFunction` honours SSE Transport in editor test mode; CI actions bumped to v5 |
| `1.0.4` | `v0.9.3` | `1.82.0` | `20.15` | Patch — cluster sub-nodes ship both `supplyData()` + `execute()` (fixes n8n Tools Agent mode) |
| `1.0.3` | `v0.9.3` | `1.82.0` | `20.15` | Patch — Spawn dropdown pulls the loomcycle agent library via `listLibraryAgents` (adapter `^0.10.3`) |
| `1.0.2` | `v0.9.2` | `1.82.0` | `20.15` | Patch — codex AI-category cleanup so action node + triggers appear in n8n 2.x node picker |
| `1.0.1` | `v0.9.2` | `1.82.0` | `20.15` | Patch — adapter `^0.10.1` (dual ESM/CJS) so self-hosted n8n CJS loader resolves it |
| `1.0.0` | `v0.9.2` | `1.82.0` | `20.15` | First stable. Full feature set: 7 nodes + 1 credential. |
| `0.6.0` | `v0.9.2` | `1.82.0` | `20.15` | Sub-phase 2.5 — adds 6 example workflows |
| `0.5.0` | `v0.9.2` | `1.82.0` | `20.15` | Sub-phase 2.4 — cluster sub-nodes (incl. MCPServerTool) |
| `0.4.0` | `v0.9.2` | `1.82.0` | `20.15` | Sub-phase 2.3 — trigger nodes |
| `0.3.0` | `v0.9.2` | `1.82.0` | `20.15` | Sub-phase 2.2 — substrate-admin (AgentDef / SkillDef / MCPServerDef) |
| `0.2.0` | `v0.8.x` | `1.82.0` | `20.15` | Sub-phase 2.1 — action nodes (Run / Memory / Channel) |
| `0.1.0` | `v0.8.x` | `1.82.0` | `20.15` | Sub-phase 2.0 — credential + scaffolding only |

### Per-feature minimum

| Feature | Min loomcycle |
|---|---|
| Channel CRUD (publish / subscribe / peek / ack) | `v0.9.2` (PR #180) |
| `content_sha256` Verify op | `v0.9.x` (PR #175) |
| **MCPServerDef substrate** | `v0.9.2` (PR #177) |
| `parentAgentId` filter + `debug` toggle on `streamUserRunStates` | `v0.9.2` (PR #181) |
| AgentDef + SkillDef substrate-admin | `v0.8.22` (PR #163) |
| Channel listing (`GET /v1/_channels`) | `v0.9.x` (PR #173) |
| User-runs SSE stream (`GET /v1/users/{id}/agents/stream`) | `v0.9.x` (PR #173) |
| Library v2 (`GET /v1/_library/{agents,skills,mcp-servers}`) | `v0.9.3` — exposed via adapter `^0.10.3` |

If you're on an older loomcycle, the unaffected nodes still work; the gated ones surface a clean `NodeApiError("Requires loomcycle vX.Y")`.

## Verified deployments

The integration is smoke-tested end-to-end on the following configuration (last validated 2026-05-24 against `n8n-nodes-loomcycle@1.0.4`):

| Surface | Configuration | Result |
|---|---|---|
| Self-hosted n8n | TrueNAS-hosted Docker, n8n `2.22.1` | All 7 nodes + 1 credential load cleanly |
| Network path | Direct IP (Tailscale MagicDNS bypassed inside the n8n container) | sub-20 ms SSE round-trips |
| Action node — `Run → Spawn` | `claude-sonnet-4-6` Anthropic Chat Model on the loomcycle side, library dropdown picking a yaml-static agent | Spawns + drains + returns structured output |
| Trigger — `Run Completed` (SSE published / "Active" mode) | Cross-tab spawn → live execution row appearance | Push latency ~8-18 ms |
| Cluster sub-node — `Memory Tool` inside n8n AI Agent | Anthropic Chat Model wired to the AI Agent's Chat Model slot, `LoomCycle Memory Tool` to the Tool slot | LLM calls `op: listScopes`, receives `{scopes: [...]}`, writes natural-language summary in ~12s end-to-end |

If your deployment differs materially (Cloudflare worker layer, nginx with `proxy_buffering on`, kubernetes ingress with idle timeout), validate the **`Run Completed` (SSE)** path first — it's the most sensitive to network layer behaviour. Switch its **Transport** parameter to `Polling` if SSE drops; everything else uses regular HTTP and tends to work everywhere.

## Breaking-change policy

Per [semver](https://semver.org/):

- **Patch releases** (`1.0.0` → `1.0.1`): bug fixes, internal cleanup. No operator-visible changes.
- **Minor releases** (`1.0.0` → `1.1.0`): new nodes, new operations, new credential fields. Backwards-compatible — existing workflows continue to work.
- **Major releases** (`1.0.0` → `2.0.0`): removed/renamed nodes, removed operations, credential schema changes, n8n peer-dep major bump. Migration notes in CHANGELOG.

We aim to keep major releases coordinated with loomcycle's own major releases — if loomcycle hits `v1.0`, this package will release `v2.0` alongside.

## Filing issues

Open at [github.com/denn-gubsky/n8n-nodes-loomcycle/issues](https://github.com/denn-gubsky/n8n-nodes-loomcycle/issues).

**Include:**
- Your `n8n-nodes-loomcycle` version (`npm list n8n-nodes-loomcycle -g` or check the Community Nodes panel)
- Your n8n version (Settings → Help → About)
- Your loomcycle version (`curl http://your-loomcycle/healthz` returns `{"version": "..."}`)
- A minimum reproduction — export a workflow JSON via n8n's "Export" menu and attach
- Relevant n8n execution log output (with bearer tokens redacted)

**Wire-API issues** (the loomcycle backend behaving incorrectly): file against [loomcycle](https://github.com/denn-gubsky/loomcycle/issues) instead. This package is a thin adapter over `@loomcycle/client`.

## Security

The credential boundary is documented in [`CLAUDE.md`](../CLAUDE.md) §"Security rules" and the integration design ensures bearer tokens never leak into:

- n8n execution-log UI
- node-error descriptions
- the LangChain tool's argument or response (cluster sub-nodes redact)
- the dynamic-MCP-registration wire (only template strings travel; substitution happens server-side)

If you find a credential-leakage path, please **do not file a public issue**. Email the package maintainer directly. See `package.json` `author` for contact.
