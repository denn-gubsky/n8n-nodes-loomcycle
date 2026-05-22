# n8n-nodes-loomcycle

Community n8n nodes for the [loomcycle](https://github.com/denn-gubsky/loomcycle) agentic runtime — design and operate loomcycle agents directly from n8n's visual builder.

## Status — Sub-phase 2.0 (scaffolding)

This package is in active development. **Not yet on npm.** The current release (`0.1.0`) ships the package scaffolding + a single `LoomCycle API` credential type with a `/healthz` test. Action nodes, trigger nodes, and cluster sub-nodes land in Sub-phases 2.1 through 2.4; the first public npm release is Sub-phase 2.6.

See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the full sub-phase plan and [`CLAUDE.md`](CLAUDE.md) for development conventions.

## What this package will offer (at 1.0.0)

- **Action nodes** — umbrella `LoomCycle` node with 7 resource groups: Run, Memory, Channel, AgentDef, Evaluation, Context, MCPServerDef. ~40 operations total.
- **Trigger nodes** — `LoomCycle: Run Completed` (SSE + polling fallback) and `LoomCycle: Channel Message` (long-poll subscribe).
- **Cluster sub-nodes** — 5 sub-nodes pluggable into n8n's AI Agent: Memory Tool, Channel Tool, Sub-Agent Tool, Context Help Tool, **MCP Server Tool** (dynamic provisioning).
- **Example workflows** — 6 importable JSONs covering canonical composition patterns.

## Requirements

- n8n `>= 1.82.0 < 2.0.0`
- Node `>= 20.15`
- A running loomcycle deployment `>= 0.9.2` reachable from your n8n instance

## License

Apache-2.0. See [`LICENSE`](LICENSE).
