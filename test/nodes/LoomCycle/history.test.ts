import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
	mockClient: { history: vi.fn(), health: vi.fn() },
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleHistory as LoomCycle } from '../../../nodes/LoomCycleHistory/LoomCycleHistory.node';
import { makeExecuteContext } from './_helpers';

beforeEach(() => {
	Object.values(mockClient).forEach((fn) => fn.mockReset());
});

describe('LoomCycle resource=history', () => {
	it('List defaults to self scope and sends nothing else', async () => {
		mockClient.history.mockResolvedValue({ chats: [], total: 0 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({ params: { resource: 'history', operation: 'list' } });
		await node.execute.call(ctx);
		expect(mockClient.history).toHaveBeenCalledWith({ op: 'list', scope: 'self' });
	});

	it('List folds every filter it was given', async () => {
		mockClient.history.mockResolvedValue({ chats: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'history',
				operation: 'list',
				scope: 'tenant',
				limit: 10,
				filters: {
					status: 'completed',
					from: '2026-08-01T00:00:00.000Z',
					to: '2026-08-31T00:00:00.000Z',
					tag: 'triage',
					titleContains: 'digest',
					pinnedOnly: true,
					includeArchived: true,
					includeInternal: true,
					offset: 20,
				},
			},
		});
		await node.execute.call(ctx);
		expect(mockClient.history).toHaveBeenCalledWith({
			op: 'list',
			scope: 'tenant',
			status: 'completed',
			from: '2026-08-01T00:00:00.000Z',
			to: '2026-08-31T00:00:00.000Z',
			tag: 'triage',
			title_contains: 'digest',
			pinned_only: true,
			include_archived: true,
			include_internal: true,
			offset: 20,
			limit: 10,
		});
	});

	// Maintenance-agent chats are runtime bookkeeping, excluded by default, so an
	// off toggle must not reach the wire as `false`.
	it('List omits the boolean filters when they are off', async () => {
		mockClient.history.mockResolvedValue({ chats: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'history',
				operation: 'list',
				filters: { pinnedOnly: false, includeArchived: false, includeInternal: false, offset: 0 },
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.history.mock.calls[0][0];
		for (const key of ['pinned_only', 'include_archived', 'include_internal', 'offset']) {
			expect(arg).not.toHaveProperty(key);
		}
	});

	// '' is the default structured event array, so it must be omitted rather than
	// sent as an empty format string.
	it('Get omits format for the structured default and sends it otherwise', async () => {
		mockClient.history.mockResolvedValue({ events: [] });
		const node = new LoomCycle();
		const ctxDefault = makeExecuteContext({
			params: { resource: 'history', operation: 'get', sessionId: 's1', format: '' },
		});
		await node.execute.call(ctxDefault);
		expect(mockClient.history).toHaveBeenCalledWith({ op: 'get', scope: 'self', session_id: 's1' });

		mockClient.history.mockClear();
		const ctxConv = makeExecuteContext({
			params: { resource: 'history', operation: 'get', sessionId: 's1', format: 'conversation' },
		});
		await node.execute.call(ctxConv);
		expect(mockClient.history.mock.calls[0][0].format).toBe('conversation');
	});

	// Verified live: search matches the TITLE only. Keeping it on `query` mirrors
	// the wire, but the node must not quietly send it anywhere else.
	it('Search sends the title query', async () => {
		mockClient.history.mockResolvedValue({ chats: [], total: 0 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'history', operation: 'search', scope: 'user', query: 'weekly digest' },
		});
		await node.execute.call(ctx);
		expect(mockClient.history).toHaveBeenCalledWith({
			op: 'search',
			scope: 'user',
			query: 'weekly digest',
		});
	});

	// The substrate accepts query OR session_id on `related`, never both — which
	// is why the node makes it a radio choice.
	it('Related sends a query and no session when matching by text', async () => {
		mockClient.history.mockResolvedValue({ related: [], count: 0 });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'history',
				operation: 'related',
				scope: 'user',
				relatedBy: 'query',
				relatedQuery: 'agentic memory',
				relatedSessionId: 's-ignored',
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.history.mock.calls[0][0];
		expect(arg.query).toBe('agentic memory');
		expect(arg).not.toHaveProperty('session_id');
	});

	it('Related sends a session and no query when matching by chat', async () => {
		mockClient.history.mockResolvedValue({ related: [] });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'history',
				operation: 'related',
				relatedBy: 'session',
				relatedSessionId: 's1',
				relatedQuery: 'ignored',
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.history.mock.calls[0][0];
		expect(arg.session_id).toBe('s1');
		expect(arg).not.toHaveProperty('query');
	});

	// Annotate REPLACES the tag set, so an empty CSV must be omitted rather than
	// sent as [] — that would clear a chat's tags as a side effect of editing
	// only its description.
	it('Annotate omits tags when the CSV is empty', async () => {
		mockClient.history.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: {
				resource: 'history',
				operation: 'annotate',
				sessionId: 's1',
				chatDescription: 'quarterly review thread',
				tags: '',
			},
		});
		await node.execute.call(ctx);
		const arg = mockClient.history.mock.calls[0][0];
		expect(arg.description).toBe('quarterly review thread');
		expect(arg).not.toHaveProperty('tags');
	});

	it('Annotate sends a parsed tag set', async () => {
		mockClient.history.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'history', operation: 'annotate', sessionId: 's1', tags: 'triage, q3 ' },
		});
		await node.execute.call(ctx);
		expect(mockClient.history.mock.calls[0][0].tags).toEqual(['triage', 'q3']);
	});

	// false is the meaningful unpin / unarchive instruction, so unlike the list
	// filters these booleans are always sent.
	it('Pin and Archive send false explicitly to reverse themselves', async () => {
		mockClient.history.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const unpin = makeExecuteContext({
			params: { resource: 'history', operation: 'pin', sessionId: 's1', pinned: false },
		});
		await node.execute.call(unpin);
		expect(mockClient.history).toHaveBeenCalledWith({
			op: 'pin',
			scope: 'self',
			session_id: 's1',
			pinned: false,
		});

		mockClient.history.mockClear();
		const unarchive = makeExecuteContext({
			params: { resource: 'history', operation: 'archive', sessionId: 's1', archived: false },
		});
		await node.execute.call(unarchive);
		expect(mockClient.history.mock.calls[0][0].archived).toBe(false);
	});

	it('Rename sends the new title', async () => {
		mockClient.history.mockResolvedValue({ ok: true });
		const node = new LoomCycle();
		const ctx = makeExecuteContext({
			params: { resource: 'history', operation: 'rename', sessionId: 's1', title: 'Q3 digest' },
		});
		await node.execute.call(ctx);
		expect(mockClient.history).toHaveBeenCalledWith({
			op: 'rename',
			scope: 'self',
			session_id: 's1',
			title: 'Q3 digest',
		});
	});

	it('Recap and Resume need only a session', async () => {
		mockClient.history.mockResolvedValue({ summary: 'x' });
		const node = new LoomCycle();
		for (const operation of ['recap', 'resume']) {
			mockClient.history.mockClear();
			const ctx = makeExecuteContext({
				params: { resource: 'history', operation, sessionId: 's1' },
			});
			await node.execute.call(ctx);
			expect(mockClient.history).toHaveBeenCalledWith({ op: operation, scope: 'self', session_id: 's1' });
		}
	});
});
