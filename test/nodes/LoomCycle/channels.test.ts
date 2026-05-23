import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';

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

describe('LoomCycle resource=channel', () => {
	describe('Publish', () => {
		it('parses JSON-string payload and forwards to publishChannel', async () => {
			mockClient.publishChannel.mockResolvedValue({ msg_id: 'm1', channel: 'events', created_at: 't' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'publish',
					channel: 'events',
					scope: 'global',
					payload: '{"hello":"world"}',
				},
			});
			await node.execute.call(ctx);
			const args = mockClient.publishChannel.mock.calls[0];
			expect(args[0]).toBe('events');
			expect(args[1].scope).toBe('global');
			expect(args[1].payload).toEqual({ hello: 'world' });
		});

		it('passes deliverAt when set', async () => {
			mockClient.publishChannel.mockResolvedValue({ msg_id: 'm1', channel: 'events', created_at: 't' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'publish',
					channel: 'events',
					scope: 'global',
					payload: '{}',
					deliverAt: '2026-05-23T00:00:00Z',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.publishChannel.mock.calls[0][1].deliverAt).toBe('2026-05-23T00:00:00Z');
		});

		it('omits deliverAt when empty', async () => {
			mockClient.publishChannel.mockResolvedValue({ msg_id: 'm1', channel: 'events', created_at: 't' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'publish',
					channel: 'events',
					scope: 'global',
					payload: '{}',
					deliverAt: '',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.publishChannel.mock.calls[0][1].deliverAt).toBeUndefined();
		});

		it('resolves userId from credential default when scope=user and per-node userId empty', async () => {
			mockClient.publishChannel.mockResolvedValue({ msg_id: 'm1', channel: 'events', created_at: 't' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'publish',
					channel: 'events',
					scope: 'user',
					payload: '{}',
				},
				credentials: { userId: 'cred-u' },
			});
			await node.execute.call(ctx);
			expect(mockClient.publishChannel.mock.calls[0][1].userId).toBe('cred-u');
		});

		it('throws NodeOperationError on invalid JSON payload (strict mode)', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'publish',
					channel: 'events',
					scope: 'global',
					payload: 'this is not json {',
				},
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
			expect(mockClient.publishChannel).not.toHaveBeenCalled();
		});

		it('throws NodeOperationError when scope=user and no userId resolvable', async () => {
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'publish',
					channel: 'events',
					scope: 'user',
					payload: '{}',
				},
			});
			await expect(node.execute.call(ctx)).rejects.toBeInstanceOf(NodeOperationError);
		});
	});

	describe('Subscribe', () => {
		it('forwards channel + scope + waitMs + maxMessages', async () => {
			mockClient.subscribeChannel.mockResolvedValue({ channel: 'events', messages: [], next_cursor: '' });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'subscribe',
					channel: 'events',
					scope: 'global',
					additionalFields: { waitMs: 5000, maxMessages: 20 },
				},
			});
			await node.execute.call(ctx);
			const opts = mockClient.subscribeChannel.mock.calls[0][1];
			expect(opts.waitMs).toBe(5000);
			expect(opts.maxMessages).toBe(20);
		});
	});

	describe('Peek', () => {
		it('forwards fromCursor and maxMessages without waitMs', async () => {
			mockClient.peekChannel.mockResolvedValue({ channel: 'events', messages: [] });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'peek',
					channel: 'events',
					scope: 'global',
					additionalFields: { fromCursor: 'cur_42', maxMessages: 5 },
				},
			});
			await node.execute.call(ctx);
			const opts = mockClient.peekChannel.mock.calls[0][1];
			expect(opts.fromCursor).toBe('cur_42');
			expect(opts.maxMessages).toBe(5);
			expect('waitMs' in opts).toBe(false);
		});
	});

	describe('Ack', () => {
		it('passes channel + cursor', async () => {
			mockClient.ackChannel.mockResolvedValue({ ok: true });
			const node = new LoomCycle();
			const ctx = makeExecuteContext({
				params: {
					resource: 'channel',
					operation: 'ack',
					channel: 'events',
					scope: 'global',
					cursor: 'cur_50',
				},
			});
			await node.execute.call(ctx);
			expect(mockClient.ackChannel.mock.calls[0][1].cursor).toBe('cur_50');
		});
	});

	describe('List Channels', () => {
		it('calls listChannels and returns the response', async () => {
			mockClient.listChannels.mockResolvedValue({
				channels: [{ name: 'events', scope: 'global', message_count: 0 }],
			});
			const node = new LoomCycle();
			const ctx = makeExecuteContext({ params: { resource: 'channel', operation: 'listChannels' } });
			const result = await node.execute.call(ctx);
			expect(mockClient.listChannels).toHaveBeenCalledOnce();
			const json = result[0][0].json as Record<string, unknown>;
			expect((json.channels as unknown[])[0]).toMatchObject({ name: 'events' });
		});
	});
});
