import { describe, it, expect, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		runStreaming: vi.fn(),
		continueSession: vi.fn(),
		getAgent: vi.fn(),
		cancelAgent: vi.fn(),
		listUserAgents: vi.fn(),
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

import { loadAgents, loadChannels, loadMemoryScopes } from '../../../nodes/LoomCycle/helpers/loadOptions';
import { makeLoadOptionsContext } from './_helpers';

describe('loadOptions — SECURITY: error messages are bearer-redacted before reaching the UI', () => {
	it('loadAgents redacts Bearer fragments from the error message', async () => {
		mockClient.listUserAgents.mockRejectedValue(
			new Error('Server returned: Authorization: Bearer sk-ant-leaked-token-12345 401'),
		);
		const ctx = makeLoadOptionsContext({ credentials: { userId: 'u1' } });
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

	it('loadAgents returns the "no userId" placeholder when credentials lack a Default User ID', async () => {
		const ctx = makeLoadOptionsContext({});
		const out = await loadAgents.call(ctx);
		expect(out).toHaveLength(1);
		expect(out[0].name).toContain('Default User ID');
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
