import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { INodeExecutionData, IPollFunctions } from 'n8n-workflow';

const { mockClient } = vi.hoisted(() => ({
	mockClient: { subscribeChannel: vi.fn(), peekChannel: vi.fn(), ackChannel: vi.fn() },
}));

vi.mock('@loomcycle/client', async (importActual) => {
	const actual = await importActual<typeof import('@loomcycle/client')>();
	return { ...actual, LoomcycleClient: vi.fn(() => mockClient) };
});

import { LoomCycleChannelMessage } from '../../../nodes/LoomCycleChannelMessage/LoomCycleChannelMessage.node';

function pollCtx(params: Record<string, unknown>, staticData: Record<string, unknown> = {}): IPollFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ baseUrl: 'http://127.0.0.1:8787', bearerToken: 't', userId: '', userTier: '', mcpUrl: '' }),
		getNode: () => ({ id: 't', name: 'CM', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} }),
		getWorkflowStaticData: () => staticData,
	} as unknown as IPollFunctions;
}

function poll(node: LoomCycleChannelMessage, ctx: IPollFunctions) {
	return (node.poll as unknown as (this: IPollFunctions) => Promise<INodeExecutionData[][] | null>).call(ctx);
}

beforeEach(() => Object.values(mockClient).forEach((fn) => fn.mockReset()));

describe('LoomCycle: Channel Message — poll()', () => {
	it('auto-ack: subscribeChannel poll-once (waitMs 0) and emits messages', async () => {
		mockClient.subscribeChannel.mockResolvedValue({ messages: [{ id: 'm1', value: { a: 1 }, published_at: 't' }] });
		const res = await poll(new LoomCycleChannelMessage(), pollCtx({ channel: 'c', scope: 'global', deliveryMode: 'auto-ack', maxMessages: 10 }));
		expect(mockClient.subscribeChannel).toHaveBeenCalledWith('c', { scope: 'global', userId: undefined, maxMessages: 10, waitMs: 0 });
		expect(res![0]).toHaveLength(1);
		expect((res![0][0].json as { id: string }).id).toBe('m1');
	});

	it('returns null when the channel has no new messages', async () => {
		mockClient.subscribeChannel.mockResolvedValue({ messages: [] });
		const res = await poll(new LoomCycleChannelMessage(), pollCtx({ channel: 'c', scope: 'global', deliveryMode: 'auto-ack', maxMessages: 10 }));
		expect(res).toBeNull();
	});

	it('peek-ack: peeks from saved cursor, emits, then acks the last id + persists cursor', async () => {
		mockClient.peekChannel.mockResolvedValue({
			messages: [
				{ id: 'm1', value: {}, published_at: 't' },
				{ id: 'm2', value: {}, published_at: 't' },
			],
		});
		mockClient.ackChannel.mockResolvedValue({});
		const sd: Record<string, unknown> = {};
		const res = await poll(new LoomCycleChannelMessage(), pollCtx({ channel: 'c', scope: 'global', deliveryMode: 'peek-ack', maxMessages: 10 }, sd));
		expect(mockClient.ackChannel).toHaveBeenCalledWith('c', { scope: 'global', userId: undefined, cursor: 'm2' });
		expect(res![0]).toHaveLength(2);
	});
});
