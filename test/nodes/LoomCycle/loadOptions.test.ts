import { describe, it, expect, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		continueSession: vi.fn(),
		getAgent: vi.fn(),
		cancelAgent: vi.fn(),
		listUserAgents: vi.fn(),
		listLibraryAgents: vi.fn(),
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

import { loadAgents, loadChannels, loadMcpLibrary, loadMemoryScopes } from '../../../nodes/LoomCycle/helpers/loadOptions';
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
