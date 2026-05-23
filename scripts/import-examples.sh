#!/usr/bin/env bash
# Import all example workflows into a running n8n instance.
#
# Usage:
#   scripts/import-examples.sh           # imports via n8n CLI (uses N8N_USER_FOLDER from env)
#   scripts/import-examples.sh --list    # just lists what would be imported
#
# Prerequisites:
#   - n8n installed globally OR available via `npx n8n`
#   - `npm link` already run from this package + `npm link n8n-nodes-loomcycle`
#     in the n8n custom-nodes directory (so the loomcycle nodes are loadable)
#   - LoomCycle API credential already configured in n8n
#
# After import, you'll need to (re)attach credentials manually since the
# JSONs use placeholder credential IDs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLES_DIR="$REPO_ROOT/examples"

if [[ "${1:-}" == "--list" ]]; then
	echo "Examples that would be imported from $EXAMPLES_DIR:"
	ls "$EXAMPLES_DIR"/*.json | sort
	exit 0
fi

if ! command -v n8n >/dev/null 2>&1; then
	echo "ERROR: n8n CLI not found in PATH." >&2
	echo "Install globally: npm install -g n8n" >&2
	echo "Or run via npx (slower): npx n8n import:workflow --input=<file>" >&2
	exit 1
fi

for file in "$EXAMPLES_DIR"/*.json; do
	echo "→ Importing $(basename "$file")"
	n8n import:workflow --input="$file"
done

echo
echo "✓ All examples imported."
echo "Next: open n8n, navigate to Workflows, and reattach credentials on each LoomCycle node."
