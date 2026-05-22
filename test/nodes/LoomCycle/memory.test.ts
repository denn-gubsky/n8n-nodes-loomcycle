import { describe, it, expect, beforeEach, vi } from 'vitest';

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
	},
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycle } from '../../../nodes/LoomCycle/LoomCycle.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=memory', () => {
	it('List Scopes calls listMemoryScopes() with no args', async () => {
		mockClient.listMemoryScopes.mockResolvedValue({ scopes: [{ name: 'agent', description: '' }] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({ params: { resource: 'memory', operation: 'listScopes' } });
		const result = await node.execute.call(ctx);
		expect(mockClient.listMemoryScopes).toHaveBeenCalledOnce();
		const json = result[0][0].json as Record<string, unknown>;
		expect(Array.isArray(json.scopes)).toBe(true);
	});

	it('List Scope IDs passes scope', async () => {
		mockClient.listMemoryScopeIDs.mockResolvedValue({ scope_ids: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memory', operation: 'listScopeIDs', scope: 'user' },
		});
		await node.execute.call(ctx);
		expect(mockClient.listMemoryScopeIDs).toHaveBeenCalledWith('user');
	});

	it('List Entries passes scope + scopeID + prefix + limit', async () => {
		mockClient.listMemoryEntries.mockResolvedValue({ entries: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memory',
				operation: 'listEntries',
				scope: 'agent',
				scopeID: 'a1',
				additionalFields: { prefix: 'preference.', limit: 50 },
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.listMemoryEntries).toHaveBeenCalledWith('agent', 'a1', { prefix: 'preference.', limit: 50 });
	});

	it('List Entries omits prefix/limit when additionalFields empty', async () => {
		mockClient.listMemoryEntries.mockResolvedValue({ entries: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memory', operation: 'listEntries', scope: 'agent', scopeID: 'a1' },
		});
		await node.execute.call(ctx);
		const opts = mockClient.listMemoryEntries.mock.calls[0][2];
		expect(opts.prefix).toBeUndefined();
		expect(opts.limit).toBeUndefined();
	});

	it('Get Entry passes scope + scopeID + key', async () => {
		mockClient.getMemoryEntry.mockResolvedValue({ key: 'k1', value: 'v1' });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memory', operation: 'getEntry', scope: 'agent', scopeID: 'a1', key: 'k1' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.getMemoryEntry).toHaveBeenCalledWith('agent', 'a1', 'k1');
		expect((result[0][0].json as Record<string, unknown>).key).toBe('k1');
	});
});
