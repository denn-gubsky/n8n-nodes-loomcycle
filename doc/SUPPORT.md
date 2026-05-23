# Support matrix + breaking-change policy

## Version compatibility

| `n8n-nodes-loomcycle` | Min loomcycle | Min n8n | Min Node | Notes |
|---|---|---|---|---|
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

If you're on an older loomcycle, the unaffected nodes still work; the gated ones surface a clean `NodeApiError("Requires loomcycle vX.Y")`.

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
