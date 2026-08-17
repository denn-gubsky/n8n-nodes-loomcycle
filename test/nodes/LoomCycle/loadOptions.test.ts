import { describe, it, expect, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		continueSession: vi.fn(),
		getAgent: vi.fn(),
		cancelAgent: vi.fn(),
		listUserAgents: vi.fn(),
		listLibraryAgents: vi.fn(),
		runnableAgents: vi.fn(),
		getConfig: vi.fn(),
		listLibrarySkills: vi.fn(),
		listLibraryMcpServers: vi.fn(),
		listMemoryScopes: vi.fn(),
		listMemoryScopeIDs: vi.fn(),
		listMemoryEntries: vi.fn(),
		getMemoryEntry: vi.fn(),
		listChannels: vi.fn(),
		publishChannel: vi.fn(),
		subscribeChannel: vi.fn(),
		peekChannel: vi.fn(),
		ackChannel: vi.fn(),
		health: vi.fn(),
		agentDef: vi.fn(),
		skillDef: vi.fn(),
		mcpServerDef: vi.fn(),
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import {
	loadAgentProviders,
	loadAgents,
	loadChannels,
	loadMcpLibrary,
	loadMemoryScopes,
} from '../../../nodes/LoomCycle/helpers/loadOptions';
import { makeLoadOptionsContext } from './_helpers';

describe('loadOptions — SECURITY: error messages are bearer-redacted before reaching the UI', () => {
	it('loadAgents redacts Bearer fragments from the error message', async () => {
		mockClient.listLibraryAgents.mockRejectedValue(
			new Error('Server returned: Authorization: Bearer sk-ant-leaked-token-12345 401'),
		);
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		const surface = JSON.stringify(out);
		expect(surface).not.toContain('sk-ant-leaked-token-12345');
		expect(surface).toContain('[REDACTED]');
	});

	it('loadChannels redacts Bearer fragments from the error message', async () => {
		mockClient.listChannels.mockRejectedValue(new Error('failed with Bearer leaked-token-abcdef123456'));
		const ctx = makeLoadOptionsContext({});
		const out = await loadChannels.call(ctx);
		const surface = JSON.stringify(out);
		expect(surface).not.toContain('leaked-token-abcdef123456');
		expect(surface).toContain('[REDACTED]');
	});

	it('loadMemoryScopes redacts Bearer fragments from the error message', async () => {
		mockClient.listMemoryScopes.mockRejectedValue(
			new Error('Authorization: Bearer sk-test-secret-9999 was rejected'),
		);
		const ctx = makeLoadOptionsContext({});
		const out = await loadMemoryScopes.call(ctx);
		const surface = JSON.stringify(out);
		expect(surface).not.toContain('sk-test-secret-9999');
		expect(surface).toContain('[REDACTED]');
	});

	it('loadAgents returns an informative placeholder when the library is empty', async () => {
		mockClient.listLibraryAgents.mockResolvedValue({ entries: [] });
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out).toHaveLength(1);
		expect(out[0].name).toContain('loomcycle.yaml');
		expect(out[0].name).toContain('AgentDef');
	});

	it('loadAgents returns alphabetically-sorted library entries with source-tag descriptions', async () => {
		mockClient.listLibraryAgents.mockResolvedValue({
			entries: [
				{
					name: 'summariser',
					source: 'static-only',
					in_static: true,
					in_substrate: false,
					version_count: 1,
					latest_version: 1,
				},
				{
					name: 'researcher',
					source: 'both',
					in_static: true,
					in_substrate: true,
					version_count: 3,
					latest_version: 3,
				},
				{
					name: 'scrubber',
					source: 'dynamic-only',
					in_static: false,
					in_substrate: true,
					version_count: 2,
					latest_version: 2,
				},
			],
		});
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out.map((o) => o.name)).toEqual(['researcher', 'scrubber', 'summariser']);
		expect(out.map((o) => o.value)).toEqual(['researcher', 'scrubber', 'summariser']);
		// Source-tag descriptions show provenance + version metadata.
		const byName = Object.fromEntries(out.map((o) => [o.name, o.description]));
		expect(byName.researcher).toBe('yaml + dynamic · v3 · 3 versions');
		expect(byName.scrubber).toBe('dynamic AgentDef · v2 · 2 versions');
		expect(byName.summariser).toBe('yaml-static · v1 · 1 version');
	});

	it('loadAgents does NOT require a Default User ID on the credential (library endpoint is operator-scoped)', async () => {
		mockClient.listLibraryAgents.mockResolvedValue({
			entries: [
				{
					name: 'solo',
					source: 'static-only',
					in_static: true,
					in_substrate: false,
					version_count: 1,
				},
			],
		});
		// No credentials.userId supplied — should still succeed.
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out).toHaveLength(1);
		expect(out[0].value).toBe('solo');
	});

	it('loadMcpLibrary redacts Bearer fragments from the error message', async () => {
		mockClient.listLibraryMcpServers.mockRejectedValue(
			new Error('Authorization: Bearer sk-mcp-leaked-7777 401'),
		);
		const ctx = makeLoadOptionsContext({});
		const out = await loadMcpLibrary.call(ctx);
		const surface = JSON.stringify(out);
		expect(surface).not.toContain('sk-mcp-leaked-7777');
		expect(surface).toContain('[REDACTED]');
	});

	it('loadMcpLibrary returns alphabetically-sorted entries with source-tag descriptions', async () => {
		mockClient.listLibraryMcpServers.mockResolvedValue({
			entries: [
				{ name: 'slack', source: 'dynamic-only', version_count: 1, latest_version: 1 },
				{ name: 'github', source: 'both', version_count: 2, latest_version: 2 },
			],
		});
		const ctx = makeLoadOptionsContext({});
		const out = await loadMcpLibrary.call(ctx);
		expect(out.map((o) => o.name)).toEqual(['github', 'slack']);
		expect(out.map((o) => o.value)).toEqual(['github', 'slack']);
	});

	it('loadMcpLibrary returns an informative placeholder when empty', async () => {
		mockClient.listLibraryMcpServers.mockResolvedValue({ entries: [] });
		const ctx = makeLoadOptionsContext({});
		const out = await loadMcpLibrary.call(ctx);
		expect(out).toHaveLength(1);
		expect(out[0].name).toContain('MCPServerDef');
	});

	it('loadChannels happy path returns sorted channel names', async () => {
		mockClient.listChannels.mockResolvedValue({
			channels: [
				{ name: 'beta', message_count: 0 },
				{ name: 'alpha', message_count: 0 },
			],
		});
		const ctx = makeLoadOptionsContext({});
		const out = await loadChannels.call(ctx);
		expect(out.map((o) => o.name)).toEqual(['alpha', 'beta']);
	});

	it('loadMemoryScopes happy path returns sorted scope names', async () => {
		mockClient.listMemoryScopes.mockResolvedValue({
			scopes: [
				{ name: 'user', description: '' },
				{ name: 'agent', description: '' },
			],
		});
		const ctx = makeLoadOptionsContext({});
		const out = await loadMemoryScopes.call(ctx);
		expect(out.map((o) => o.name)).toEqual(['agent', 'user']);
	});
});

// The Library lives on the operator def-plane, so a DELEGATED per-user token
// (RFC BX) is refused there while still holding runs:read. Without the
// fallback the agent dropdown is permanently empty for member credentials.
describe('loadAgents — delegated-token fallback to runnableAgents (RFC BY)', () => {
	it('falls back to the runnable-agent listing when the Library read fails', async () => {
		mockClient.listLibraryAgents.mockRejectedValue(new Error('403 forbidden'));
		mockClient.runnableAgents.mockResolvedValue({
			agents: [
				{ name: 'summariser', source: 'tenant' },
				{ name: 'bundled-helper', source: 'bundled' },
			],
		});
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out.map((o) => o.value)).toEqual(['bundled-helper', 'summariser']);
		expect(out[0].description).toBe('bundled');
	});

	it('prefers the Library when it succeeds and never calls the fallback', async () => {
		mockClient.listLibraryAgents.mockResolvedValue({
			entries: [{ name: 'researcher', source: 'both', latest_version: 2, version_count: 2 }],
		});
		mockClient.runnableAgents.mockReset();
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out.map((o) => o.value)).toEqual(['researcher']);
		expect(mockClient.runnableAgents).not.toHaveBeenCalled();
	});

	// When BOTH fail the operator needs the Library diagnostic, not the
	// fallback's — the Library is the path they configured the node for.
	it('reports the Library error when the fallback also fails', async () => {
		mockClient.listLibraryAgents.mockRejectedValue(new Error('library exploded'));
		mockClient.runnableAgents.mockRejectedValue(new Error('fallback exploded'));
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out).toHaveLength(1);
		expect(out[0].name).toContain('library exploded');
		expect(out[0].name).not.toContain('fallback exploded');
	});

	it('returns an instructional placeholder when the fallback list is empty', async () => {
		mockClient.listLibraryAgents.mockRejectedValue(new Error('403'));
		mockClient.runnableAgents.mockResolvedValue({ agents: [] });
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out).toHaveLength(1);
		expect(out[0].value).toBe('');
		expect(out[0].name).toContain('no runnable agents');
	});
});

describe('loadAgentProviders — live provider cascade plus synthetic entries', () => {
	it('prepends the unset default and synthetic code-js ahead of live providers', async () => {
		mockClient.getConfig.mockResolvedValue({
			providers: [
				{ provider: 'openai', active: false },
				{ provider: 'anthropic', active: true },
			],
		});
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgentProviders.call(ctx);
		expect(out.map((o) => o.value)).toEqual(['', 'code-js', 'anthropic', 'openai']);
		// Inactive providers stay selectable — an operator may author against a
		// provider they are about to enable — but are badged as such.
		expect(out[2].description).toBe('active');
		expect(out[3].description).toBe('configured, not active');
	});

	// code-js is gated by an env var, not the provider cascade, and it drives
	// the conditional code-body editor. Losing it on a config failure would make
	// authoring a code agent impossible.
	it('still offers the unset default and code-js when the config read fails', async () => {
		mockClient.getConfig.mockRejectedValue(new Error('config unavailable'));
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgentProviders.call(ctx);
		expect(out.map((o) => o.value)).toEqual(['', 'code-js']);
	});
});
