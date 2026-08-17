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
		memorySearch: vi.fn(),
		memoryEmbedStats: vi.fn(),
		reembedMemory: vi.fn(),
		backfillEmbeddings: vi.fn(),
		purgeStaleEmbeddings: vi.fn(),
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

import { LoomCycleMemory as LoomCycle } from '../../../nodes/LoomCycleMemory/LoomCycleMemory.node';
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

	// REGRESSION: pre-fix, an empty / whitespace-only value silently
	// coerced to `{}` via parseJsonField's strict-mode default,
	// destructively overwriting the stored entry with an empty object.
	// Now we throw early so the operator sees the misconfiguration.
	it('REGRESSION — Set Entry throws on empty value rather than coercing to {}', async () => {
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memory',
				operation: 'setEntry',
				scope: 's',
				scopeID: 'i',
				key: 'k',
				value: '',
				setOptions: {},
			},
		});
		await expect(node.execute.call(ctx)).rejects.toThrow(/Value is required/);
		expect(mockClient.setMemoryEntry).not.toHaveBeenCalled();
	});

	it('REGRESSION — Set Entry throws on whitespace-only value', async () => {
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'memory',
				operation: 'setEntry',
				scope: 's',
				scopeID: 'i',
				key: 'k',
				value: '   \n  ',
				setOptions: {},
			},
		});
		await expect(node.execute.call(ctx)).rejects.toThrow(/Value is required/);
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

	// ---- RFC BV/BW unified search (loomcycle v1.47 / v1.49) ----

	describe('Search', () => {
		it('Search maps scopeID onto scopeId and omits unset options', async () => {
			mockClient.memorySearch.mockResolvedValue({ entries: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'memory', operation: 'search', query: 'where did I note the ship date', scope: 'user', scopeID: 'u1' },
			});
			await node.execute.call(ctx);
			// Exact payload: an omitted topK/sources must not appear, so the
			// server applies its own defaults (sources omitted = span all planes).
			expect(mockClient.memorySearch).toHaveBeenCalledWith({
				query: 'where did I note the ship date',
				scope: 'user',
				scopeId: 'u1',
			});
		});

		it('Search forwards topK and a parsed sources list', async () => {
			mockClient.memorySearch.mockResolvedValue({ entries: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'memory',
					operation: 'search',
					query: 'q',
					scope: 'user',
					scopeID: 'u1',
					searchOptions: { topK: 5, sources: 'facts, notes , documents' },
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.memorySearch).toHaveBeenCalledWith({
				query: 'q',
				scope: 'user',
				scopeId: 'u1',
				topK: 5,
				sources: ['facts', 'notes', 'documents'],
			});
		});

		// The substrate rejects this combination with 400 invalid_sources; we
		// refuse it locally so the operator gets an actionable message instead.
		it('Search refuses documents combined with only one of facts/notes', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'memory',
					operation: 'search',
					query: 'q',
					scope: 'user',
					scopeID: 'u1',
					searchOptions: { sources: 'documents, facts' },
				},
			});
			await expect(node.execute.call(ctx)).rejects.toThrow(/independent dimensions/);
			expect(mockClient.memorySearch).not.toHaveBeenCalled();
		});

		it('Search accepts documents alone', async () => {
			mockClient.memorySearch.mockResolvedValue({ entries: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'memory',
					operation: 'search',
					query: 'q',
					scope: 'user',
					scopeID: 'u1',
					searchOptions: { sources: 'documents' },
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.memorySearch).toHaveBeenCalledWith(
				expect.objectContaining({ sources: ['documents'] }),
			);
		});
	});

	// ---- Embedding maintenance (loomcycle v1.46 / v1.47) ----

	describe('Embedding maintenance', () => {
		it('Embed Stats calls memoryEmbedStats with the scope only', async () => {
			mockClient.memoryEmbedStats.mockResolvedValue({ models: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'memory', operation: 'embedStats', scope: 'user' },
			});
			await node.execute.call(ctx);
			expect(mockClient.memoryEmbedStats).toHaveBeenCalledWith('user');
		});

		// dry_run defaults TRUE server-side. Leaving Commit off must send NO
		// dryRun key at all, so the server default governs.
		it('Reembed omits dryRun when Commit is off, leaving the server dry-run default', async () => {
			mockClient.reembedMemory.mockResolvedValue({ dry_run: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'memory', operation: 'reembed', scope: 'user', scopeID: 'u1' },
			});
			await node.execute.call(ctx);
			expect(mockClient.reembedMemory).toHaveBeenCalledWith('user', 'u1', {});
		});

		it('Reembed sends dryRun false only when Commit is on', async () => {
			mockClient.reembedMemory.mockResolvedValue({ dry_run: false });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'memory', operation: 'reembed', scope: 'user', scopeID: 'u1', commit: true },
			});
			await node.execute.call(ctx);
			expect(mockClient.reembedMemory).toHaveBeenCalledWith('user', 'u1', { dryRun: false });
		});

		// reembedMemory has no prefix parameter — only backfill / purge do, so a
		// configured prefix must not leak into the reembed call.
		it('Reembed drops the prefix option, which its endpoint does not accept', async () => {
			mockClient.reembedMemory.mockResolvedValue({ dry_run: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'memory',
					operation: 'reembed',
					scope: 'user',
					scopeID: 'u1',
					maintenanceOptions: { prefix: 'notes/', maxRows: 250 },
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.reembedMemory).toHaveBeenCalledWith('user', 'u1', { limit: 250 });
		});

		it('Backfill Embeddings forwards prefix and maxRows as limit', async () => {
			mockClient.backfillEmbeddings.mockResolvedValue({ dry_run: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'memory',
					operation: 'backfillEmbeddings',
					scope: 'user',
					scopeID: 'u1',
					commit: true,
					maintenanceOptions: { prefix: 'notes/', maxRows: 100 },
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.backfillEmbeddings).toHaveBeenCalledWith('user', 'u1', {
				dryRun: false,
				limit: 100,
				prefix: 'notes/',
			});
		});

		it('Purge Stale Embeddings defaults to a dry run', async () => {
			mockClient.purgeStaleEmbeddings.mockResolvedValue({ dry_run: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: { resource: 'memory', operation: 'purgeStaleEmbeddings', scope: 'user', scopeID: 'u1' },
			});
			await node.execute.call(ctx);
			expect(mockClient.purgeStaleEmbeddings).toHaveBeenCalledWith('user', 'u1', {});
		});
	});
});
