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
		setMemoryEntry: vi.fn(),
		deleteMemoryEntry: vi.fn(),
		listChannels: vi.fn(),
		publishChannel: vi.fn(),
		subscribeChannel: vi.fn(),
		peekChannel: vi.fn(),
		ackChannel: vi.fn(),
		createChannel: vi.fn(),
		updateChannel: vi.fn(),
		deleteChannel: vi.fn(),
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

	// ---- v0.11.5 admin CRUD ----

	it('Set Entry forwards scope + scopeID + key + parsed JSON value', async () => {
		mockClient.setMemoryEntry.mockResolvedValue({
			scope: 'briefings',
			scope_id: 'arctic-terns',
			key: 'raw',
			embedded: false,
		});
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memory',
				operation: 'setEntry',
				scope: 'briefings',
				scopeID: 'arctic-terns',
				key: 'raw',
				value: '{"text":"Arctic terns migrate further than any other bird"}',
				setOptions: {},
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.setMemoryEntry).toHaveBeenCalledWith(
			'briefings',
			'arctic-terns',
			'raw',
			expect.objectContaining({ value: { text: 'Arctic terns migrate further than any other bird' } }),
		);
	});

	it('Set Entry honours embed=true + ttlSeconds in opts', async () => {
		mockClient.setMemoryEntry.mockResolvedValue({ scope: 's', scope_id: 'i', key: 'k', embedded: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memory',
				operation: 'setEntry',
				scope: 's',
				scopeID: 'i',
				key: 'k',
				value: '{"x":1}',
				setOptions: { embed: true, ttlSeconds: 3600 },
			},
		});
		await node.execute.call(ctx);
		const opts = mockClient.setMemoryEntry.mock.calls[0][3];
		expect(opts.embed).toBe(true);
		expect(opts.ttl_seconds).toBe(3600);
	});

	it('Set Entry throws on invalid JSON value (strict parse)', async () => {
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memory',
				operation: 'setEntry',
				scope: 's',
				scopeID: 'i',
				key: 'k',
				value: 'this is not json',
				setOptions: {},
			},
		});
		await expect(node.execute.call(ctx)).rejects.toThrow(/Invalid JSON/);
		expect(mockClient.setMemoryEntry).not.toHaveBeenCalled();
	});

	it('Delete Entry calls deleteMemoryEntry + surfaces ok envelope', async () => {
		mockClient.deleteMemoryEntry.mockResolvedValue(undefined);
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'memory', operation: 'deleteEntry', scope: 's', scopeID: 'i', key: 'k' },
		});
		const result = await node.execute.call(ctx);
		expect(mockClient.deleteMemoryEntry).toHaveBeenCalledWith('s', 'i', 'k');
		expect(result[0][0].json).toMatchObject({ ok: true, scope: 's', scope_id: 'i', key: 'k' });
	});
});
