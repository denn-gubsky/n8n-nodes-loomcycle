#!/usr/bin/env bash
# Spin up a local loomcycle for the integration test suite.
#
# Usage:
#   scripts/start-loomcycle.sh                 # starts in foreground
#   scripts/start-loomcycle.sh --background    # backgrounds + writes pidfile
#   scripts/start-loomcycle.sh --stop          # stops a backgrounded instance
#
# Looks for the loomcycle binary at $LOOMCYCLE_BIN (or assumes
# `~/work/loomcycle/bin/loomcycle` per the repo convention).
#
# Required env (typically loaded from ~/work/loomcycle/.env.local):
#   LOOMCYCLE_AUTH_TOKEN
#   ANTHROPIC_API_KEY / OPENAI_API_KEY / etc. (for actual agent runs)

set -euo pipefail

LOOMCYCLE_BIN="${LOOMCYCLE_BIN:-$HOME/work/loomcycle/bin/loomcycle}"
LOOMCYCLE_CONFIG="${LOOMCYCLE_CONFIG:-$HOME/.config/loomcycle/loomcycle.yaml}"
PIDFILE="/tmp/n8n-nodes-loomcycle-integration.pid"

case "${1:-}" in
	--stop)
		if [[ ! -f "$PIDFILE" ]]; then
			echo "No pidfile at $PIDFILE — nothing to stop."
			exit 0
		fi
		pid=$(cat "$PIDFILE")
		echo "Stopping loomcycle (pid $pid)…"
		kill "$pid" || true
		rm -f "$PIDFILE"
		;;
	--background)
		if [[ ! -x "$LOOMCYCLE_BIN" ]]; then
			echo "ERROR: loomcycle binary not found at $LOOMCYCLE_BIN" >&2
			echo "Build with: cd ~/work/loomcycle && make build" >&2
			exit 1
		fi
		"$LOOMCYCLE_BIN" --config "$LOOMCYCLE_CONFIG" >/tmp/n8n-nodes-loomcycle-integration.log 2>&1 &
		echo $! >"$PIDFILE"
		echo "loomcycle started (pid $(cat "$PIDFILE")); log: /tmp/n8n-nodes-loomcycle-integration.log"
		;;
	*)
		if [[ ! -x "$LOOMCYCLE_BIN" ]]; then
			echo "ERROR: loomcycle binary not found at $LOOMCYCLE_BIN" >&2
			exit 1
		fi
		exec "$LOOMCYCLE_BIN" --config "$LOOMCYCLE_CONFIG"
		;;
esac
