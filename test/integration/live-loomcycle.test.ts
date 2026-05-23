import { describe, it, expect } from 'vitest';
import { LoomcycleClient } from '@loomcycle/client';

/**
 * Smoke matrix against a running loomcycle.
 *
 * **Skips automatically** when `LOOMCYCLE_BASE_URL` is unset — local
 * developers and the standard CI don't need a live loomcycle to land a
 * green build. To run:
 *
 *   LOOMCYCLE_BASE_URL=http://127.0.0.1:8787 \
 *   LOOMCYCLE_AUTH_TOKEN=<token> \
 *   npm test
 *
 * The matrix is intentionally minimal in 2.5 — full per-node round-trip
 * coverage lives in the (deferred) `.github/workflows/integration.yml`
 * daily cron, which runs n8n + loomcycle containers end-to-end.
 *
 * What's covered here:
 *   - `/healthz` reachability
 *   - List Channels round-trip (admin endpoint, PR #173)
 *   - List Memory Scopes round-trip
 *   - mcpServerDef list (substrate readiness; expects v0.9.2+)
 */

const baseUrl = process.env.LOOMCYCLE_BASE_URL;
const authToken = process.env.LOOMCYCLE_AUTH_TOKEN;
const runLive = Boolean(baseUrl);

describe.runIf(runLive)('live loomcycle smoke matrix', () => {
	const client = new LoomcycleClient({ baseUrl, authToken });

	it('GET /healthz returns ok=true', async () => {
		const health = await client.health();
		expect(health.ok).toBe(true);
	});

	it('GET /v1/_channels returns the channels array', async () => {
		const resp = await client.listChannels();
		expect(Array.isArray(resp.channels)).toBe(true);
	});

	it('GET /v1/_memory/scopes returns the scopes array', async () => {
		const resp = await client.listMemoryScopes();
		expect(Array.isArray(resp.scopes)).toBe(true);
	});

	it('POST /v1/_mcpserverdef (op=list) returns substrate-readiness signal (v0.9.2+)', async () => {
		// `list` on MCPServerDef without filter returns all known
		// registrations (empty array on a fresh substrate). Confirms
		// the endpoint exists and the bearer authenticates.
		const resp = await client.mcpServerDef({ op: 'list' });
		expect(resp).toBeDefined();
	});
});

describe.skipIf(runLive)('live loomcycle smoke matrix (SKIPPED — set LOOMCYCLE_BASE_URL to run)', () => {
	it('placeholder', () => {
		expect(true).toBe(true);
	});
});
